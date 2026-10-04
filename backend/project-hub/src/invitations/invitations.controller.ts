import { Controller, Post, Body, Param, UseGuards, Get } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation-dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation-dto';
import { JwtAuthGuard } from '../auth/guards/jwt_auth.guard'; 

@UseGuards(JwtAuthGuard)
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('organizations/:orgId/invitations')
  createInvitation(
    @Param('orgId') orgId: string,
    @Body() body: CreateInvitationDto,
    @CurrentUser() user: {userId: string}
  ) {
    return this.invitationsService.createInvitation(user.userId, orgId, body);
  }
  
  @Post('invitations/accept')
  acceptInvitation(
    @Body() body: AcceptInvitationDto,
    @CurrentUser() user: {userId: string}  
  ){
    return this.invitationsService.acceptInvitation(user.userId, body.token);
  }

  @Get('organizations/:orgId/invitations')
  getPendingInvitations(
    @Param('orgId') orgId: string,
  ) {
    return this.invitationsService.getPendingInvitations(orgId);
  }
}
