import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TablesService } from './tables.service';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('public')
  async listPublic() {
    return this.tablesService.listPublicTables();
  }

  @Get(':id')
  async getTable(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/hand')
  async getHand(@Req() req: any, @Param('id') id: string) {
    return this.tablesService.getPlayerHandSecure(id, req.user.username);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/best-hand')
  async getBestHand(@Req() req: any, @Param('id') id: string) {
    return this.tablesService.getBestHandForPlayer(id, req.user.username);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/showdown')
  async getShowdown(@Req() req: any, @Param('id') id: string) {
    return this.tablesService.getShowdown(id, req.user.usernam);
  }

  @UseGuards(JwtAuthGuard)
  @Post('create')
  async create(@Req() req: any, @Body() body: any) {
    const username = req.user.username;
    return this.tablesService.createTable({
      ownerUsername: username,
      buyInAmount: body.buyInAmount,
      smallBlindAmount: body.smallBlindAmount,
      bigBlindAmount: body.bigBlindAmount,
      maxPlayers: body.maxPlayers,
      fillWithBots: body.fillWithBots,
      visibility: body.visibility,
      mode: 'CASUAL',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('create-competition')
  async createCompetition(@Req() req: any, @Body() body: any) {
    const username = req.user.username;
    return this.tablesService.createTable({
      ownerUsername: username,
      buyInAmount: body.buyInAmount,
      smallBlindAmount: body.smallBlindAmount,
      bigBlindAmount: body.bigBlindAmount,
      maxPlayers: body.maxPlayers,
      fillWithBots: false,
      visibility: 'PUBLIC',
      mode: 'COMPETITION',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('join')
  async joinPrivate(@Req() req: any, @Body() body: { code: string }) {
    return this.tablesService.joinByCode(body.code, req.user.username);
  }

  @UseGuards(JwtAuthGuard)
  @Post('join-public')
  async joinPublic(@Req() req: any, @Body() body: { tableId: string }) {
    return this.tablesService.joinPublic(body.tableId, req.user.username);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  async start(@Req() req: any, @Param('id') id: string) {
    return this.tablesService.startGame(id, req.user.username);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/action')
  async action(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.action(id, req.user.username, body.action, body.amount);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/flop')
  async flop(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.flop(id, body.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/turn')
  async turn(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.turn(id, body.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/river')
  async river(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.river(id, body.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/end-hand')
  async endHand(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.endHand(id, body.playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/leave')
  async leave(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.tablesService.leave(id, body.playerId ?? req.user.username);
  }
}
