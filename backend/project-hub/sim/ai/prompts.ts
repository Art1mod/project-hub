import Anthropic from '@anthropic-ai/sdk';
import { Role } from '@prisma/client';
import { SimOrg, SimUser } from '../population';
import { SessionSlot } from '../schedule';
import { stableStringify } from './stable-json';
import { World } from './schemas';

const APP_MAP = `# The app: Project Hub
A small project-management web app. Users belong to one or more organizations (orgs) and have a role in each: OWNER, ADMIN or MEMBER.

Pages (every page has a top nav bar with links to Dashboard, Projects, Members, Invitations (OWNER/ADMIN only), Settings, Profile):
- /dashboard: workload donut and status cards (To do / In progress / Done) for all projects or one project chosen in a project filter, plus an "attention" list of up to 6 open HIGH/URGENT tasks. Clicking an attention item opens that task in its project.
- /projects: the org's project list. OWNER/ADMIN can create projects.
- /projects/:id: one project's task table, 10 tasks per page with paging. Clicking a task opens the task panel (edit status, priority, assignee, description; upload or delete attachments; delete the task). "New task" opens a create form. OWNER/ADMIN can rename or delete the project.
- /members: the org's members.
- /invitations: pending invitations; OWNER/ADMIN can invite people or cancel invitations.
- /settings, /profile: rarely opened; people mostly hover these links.`;

const STEPS = `# Plan steps (the only allowed vocabulary)
The simulator turns each step into real clicks, hovers, page loads and timing. Navigation between pages is automatic: if a step needs a page, the user goes there first.
- scan_dashboard {intensity: light|heavy}: look over the dashboard, hovering attention items and cards. heavy = long triage.
- filter_dashboard {projectKey|null}: choose a project (or all) in the dashboard filter.
- open_projects_list: open /projects.
- open_project {projectKey}: open a project's task table.
- browse_tasks {projectKey, pages:[...]}: page through that project's task table, e.g. [2,3,2,1].
- open_task {taskRef}: open a task in its project.
- update_task {taskRef}: change a task's status, priority or assignee.
- create_task {projectKey, ref:"new:<n>"}: create a task; later steps (even in later sessions) can use taskRef "new:<n>". Number refs per user: new:1, new:2, ...
- delete_task {taskRef} (rare), upload_attachment {taskRef}, delete_attachment {taskRef} (rare).
- create_project {name}, update_project {projectKey}, delete_project {projectKey} (rare): OWNER/ADMIN only.
- view_members; view_invitations, invite, cancel_invitation: the last three OWNER/ADMIN only.
- hover_nav {route}: hover a nav link without clicking (e.g. /settings, /profile).
- open_settings, open_profile: rare.
- switch_org {orgId}: switch to another org the user belongs to; later steps refer to that org's projects and tasks.
- idle {minutes 1-60}: away from the screen (meeting, other app).
- leave {how: logout|close_tab}: always the last step.`;

const PERSONAS = `# Personas
- manager (OWNER): short check-ins on the dashboard, looks at members and invitations, few edits.
- lead (ADMIN): long dashboard triage (heavy scans), creates and reassigns tasks across projects, occasional invite.
- worker (MEMBER): goes from the dashboard or projects list into 1-2 projects and opens and updates 1-4 tasks; sometimes creates a task or uploads a file.
- scanner (MEMBER): pages back and forth through task tables (long browse_tasks sweeps), few edits.`;

const RULES = `# Rules
- Use only the ids and keys given in the input. Task and project keys belong to one org: after switch_org, use that org's keys.
- Respect roles: a MEMBER in the active org never uses OWNER/ADMIN-only steps.
- Keep each session's amount of work roughly in line with its target length (a step takes about 20-60 seconds; use idle for longer pauses).
- Vary sessions: not every session follows the same path, and real people repeat themselves (re-open the same busy project, check the same urgent tasks).
- Return JSON only, matching the schema.`;

/** Static, cacheable system prompt. No dates, ids or randomness, so the prefix stays identical. */
export function buildSystemBlocks(): Anthropic.TextBlockParam[] {
    return [
        { type: 'text', text: 'You design realistic usage of a web app for simulated users. Your output drives a deterministic simulator; it never reaches real people.' },
        { type: 'text', text: [APP_MAP, STEPS, PERSONAS, RULES].join('\n\n'), cache_control: { type: 'ephemeral' } },
    ];
}

export function worldPrompt(org: SimOrg, members: { user: SimUser; role: Role }[]): Anthropic.TextBlockParam[] {
    const projectRange = org.size >= 30 ? '10-15' : org.size >= 12 ? '6-10' : '4-6';
    const lines = members.map(({ user, role }) => `- userId ${user.id}: ${role}, persona ${user.persona}`);
    return [{
        type: 'text',
        text: `Create the world for one organization.

orgId: ${org.id} (use exactly this value)
Members (${members.length}):
${lines.join('\n')}

Requirements:
- A plausible theme for what this org does.
- ${projectRange} projects with unique keys (P1, P2, ...), each busy, stale or behind.
- At least one busy project with more than 20 tasks; busy projects usually span several pages of 10 tasks. Roughly ${Math.max(6, Math.round(members.length * 4))} tasks in total.
- Task keys unique within the org (e.g. P1-T01). Mix statuses (TODO, IN_PROGRESS, DONE) and priorities (about 20% HIGH or URGENT, mostly open ones).
- assigneeUserId is one of the member userIds above, or null.
- focus: one entry for every member, listing the 1-3 project keys they mostly work on.`,
    }];
}

const slotLine = (s: SessionSlot, tz: string) => {
    const when = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(s.start);
    const kind = s.driveBy ? 'drive-by (a glance under a minute: one light scan_dashboard, then leave)' : `about ${Math.round(s.targetMinutes)} min`;
    return `- slotId ${s.slotId}: ${when}, ${kind}, starts in org ${s.startOrgId}, ends with ${s.leave}`;
};

/**
 * The home-org world goes first with a cache breakpoint, so every plan request for users in the same
 * org shares a cacheable prefix. Other orgs' worlds and the user-specific text follow.
 */
export function planPrompt(user: SimUser, worlds: Map<string, World>, slots: SessionSlot[], tz: string): Anthropic.TextBlockParam[] {
    const home = worlds.get(user.homeOrgId);
    const others = user.memberships.filter((m) => m.orgId !== user.homeOrgId).map((m) => worlds.get(m.orgId)).filter((w): w is World => !!w);
    const roles = user.memberships.map((m) => `- org ${m.orgId}: ${m.role}`).join('\n');
    return [
        { type: 'text', text: `World of org ${user.homeOrgId}:\n${stableStringify(home, 2)}`, cache_control: { type: 'ephemeral' } },
        {
            type: 'text',
            text: `${others.map((w) => `World of org ${w.orgId}:\n${stableStringify(w, 2)}\n\n`).join('')}Plan the next days for this user.

userId: ${user.id}
persona: ${user.persona}
roles:
${roles}

Sessions to plan (one plan session per slotId, in this order; times are local):
${slots.map((s) => slotLine(s, tz)).join('\n')}

Each session needs a short goal and its steps. Let the story carry over between sessions (a task created in one session can be updated in a later one).`,
        },
    ];
}
