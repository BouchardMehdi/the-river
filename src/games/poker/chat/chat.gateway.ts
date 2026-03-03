import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PokerTableEntity } from '../entities/poker-table.entity';

type JoinChatPayload = { tableId: string };
type SendMessagePayload = { tableId: string; message: string };

@WebSocketGateway({
  namespace: '/poker',
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['polling', 'websocket'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(PokerTableEntity)
    private readonly tablesRepo: Repository<PokerTableEntity>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      client.on('disconnect', (reason) => {
        const u = client.data?.user?.username ?? 'unknown';
        console.log(`[chat] socket disconnected user=${u} id=${client.id} reason=${reason}`);
      });

      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        console.log('[chat] JWT_SECRET missing -> disconnect');
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, { secret });
      const username = payload?.username as string | undefined;

      if (!username) {
        console.log('[chat] token missing username -> disconnect');
        client.disconnect(true);
        return;
      }

      client.data.user = { username };
    } catch (e: any) {
      console.log('[chat] verify failed -> disconnect:', e?.message || e);
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {}

  private normalizeTableId(tableId: string) {
    return (tableId || '').trim().toUpperCase();
  }

  private roomName(tableId: string) {
    return `table:${this.normalizeTableId(tableId)}`;
  }

  private async isUserAtTable(tableId: string, username: string) {
    const table = await this.tablesRepo.findOne({
      where: { id: tableId },
      select: ['id', 'players'],
    });

    if (!table) return { ok: false as const, error: 'TABLE_NOT_FOUND' as const };
    if (!(table.players ?? []).includes(username)) return { ok: false as const, error: 'NOT_AT_TABLE' as const };
    return { ok: true as const };
  }

  // ✅ UTILISÉ PAR TablesService pour publier des infos de jeu
  emitSystemToTable(tableId: string, message: string) {
    const id = this.normalizeTableId(tableId);
    if (!/^[A-Z]{6}$/.test(id)) return;

    this.server.to(this.roomName(id)).emit('chatSystem', {
      tableId: id,
      message: String(message ?? ''),
      ts: Date.now(),
    });
  }

  @SubscribeMessage('joinTableChat')
  async joinTableChat(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChatPayload) {
    const username = client.data?.user?.username;
    if (!username) return client.emit('chatError', { error: 'UNAUTHORIZED' });

    const tableId = this.normalizeTableId(payload?.tableId || '');
    if (!/^[A-Z]{6}$/.test(tableId)) return client.emit('chatError', { error: 'INVALID_TABLE_ID' });

    const allowed = await this.isUserAtTable(tableId, username);
    if (!allowed.ok) return client.emit('chatError', { error: allowed.error });

    await client.join(this.roomName(tableId));
    client.emit('joinedChat', { tableId });
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: SendMessagePayload) {
    const username = client.data?.user?.username;
    if (!username) return client.emit('chatError', { error: 'UNAUTHORIZED' });

    const tableId = this.normalizeTableId(payload?.tableId || '');
    const message = (payload?.message || '').trim();

    if (!/^[A-Z]{6}$/.test(tableId)) return client.emit('chatError', { error: 'INVALID_TABLE_ID' });
    if (!message || message.length > 300) return client.emit('chatError', { error: 'INVALID_MESSAGE' });

    const room = this.roomName(tableId);
    if (!client.rooms.has(room)) return client.emit('chatError', { error: 'NOT_IN_ROOM' });

    const allowed = await this.isUserAtTable(tableId, username);
    if (!allowed.ok) {
      client.emit('chatError', { error: allowed.error });
      client.leave(room);
      return;
    }

    this.server.to(room).emit('chatMessage', {
      tableId,
      username,
      message,
      ts: Date.now(),
    });
  }
}
