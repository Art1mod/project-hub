import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt_auth.guard';
import { CurrentUser } from './auth/decorators/current-user.decorator';


@UseGuards(JwtAuthGuard)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(@CurrentUser() user: { userId: string }): string {
    console.log('Logged in user ID:', user.userId);
    return this.appService.getHello();
  }
}
