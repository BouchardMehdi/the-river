import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { BlackjackTable } from "./entities/blackjack-table.entity";
import { BlackjackTablePlayer } from "./entities/blackjack-table-player.entity";

type JoinChatPayload = { tableCode: string };
type SendMessagePayload = { tableCode: string; message: string };

@WebSocketGateway({
  namespace: "/blackjack",
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ["polling", "websocket"],
})
export class BlackjackChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(BlackjackTable)
    private readonly tablesRepo: Repository<BlackjackTable>,
    @InjectRepository(BlackjackTablePlayer)
    private readonly tablePlayersRepo: Repository<BlackjackTablePlayer>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      client.on("disconnect", (reason) => {
        const u = client.data?.user?.username ?? "unknown";
        console.log(`[bj-chat] disconnected user=${u} id=${client.id} reason=${reason}`);
      });

      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const secret = this.configService.get<string>("JWT_SECRET");
      if (!secret) {
        console.log("[bj-chat] JWT_SECRET missing -> disconnect");
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, { secret });
      const username = payload?.username as string | undefined;

      if (!username) {
        console.log("[bj-chat] token missing username -> disconnect");
        client.disconnect(true);
        return;
      }

      client.data.user = { username };
    } catch (e: any) {
      console.log("[bj-chat] verify failed -> disconnect:", e?.message || e);
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {}

  private normalizeCode(code: string) {
    return (code || "").trim().toUpperCase();
  }

  private roomName(code: string) {
    return `table:${this.normalizeCode(code)}`;
  }

  private async isUserAtTable(tableCode: string, username: string) {
    const code = this.normalizeCode(tableCode);
    if (!/^[A-Z]{6}$/.test(code)) return { ok: false as const, error: "INVALID_TABLE_CODE" as const };

    const table = await this.tablesRepo.findOne({ where: { code } as any });
    if (!table) return { ok: false as const, error: "TABLE_NOT_FOUND" as const };

    const seated = await this.tablePlayersRepo.findOne({
      where: { tableId: table.id, username } as any,
    });
    if (!seated) return { ok: false as const, error: "NOT_AT_TABLE" as const };

    return { ok: true as const };
  }

  // ✅ Utilisé par BlackjackService pour publier des infos de jeu
  emitSystemToTable(tableCode: string, message: string) {
    const code = this.normalizeCode(tableCode);
    if (!/^[A-Z]{6}$/.test(code)) return;

    this.server.to(this.roomName(code)).emit("chatSystem", {
      tableCode: code,
      message: String(message ?? ""),
      ts: Date.now(),
    });
  }

  @SubscribeMessage("joinTableChat")
  async joinTableChat(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChatPayload) {
    const username = client.data?.user?.username;
    if (!username) return client.emit("chatError", { error: "UNAUTHORIZED" });

    const tableCode = this.normalizeCode(payload?.tableCode || "");
    if (!/^[A-Z]{6}$/.test(tableCode)) return client.emit("chatError", { error: "INVALID_TABLE_CODE" });

    const allowed = await this.isUserAtTable(tableCode, username);
    if (!allowed.ok) return client.emit("chatError", { error: allowed.error });

    await client.join(this.roomName(tableCode));
    client.emit("joinedChat", { tableCode });
  }

  @SubscribeMessage("sendMessage")
  async sendMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: SendMessagePayload) {
    const username = client.data?.user?.username;
    if (!username) return client.emit("chatError", { error: "UNAUTHORIZED" });

    const tableCode = this.normalizeCode(payload?.tableCode || "");
    const message = (payload?.message || "").trim();

    if (!/^[A-Z]{6}$/.test(tableCode)) return client.emit("chatError", { error: "INVALID_TABLE_CODE" });
    if (!message || message.length > 300) return client.emit("chatError", { error: "INVALID_MESSAGE" });

    const room = this.roomName(tableCode);
    if (!client.rooms.has(room)) return client.emit("chatError", { error: "NOT_IN_ROOM" });

    const allowed = await this.isUserAtTable(tableCode, username);
    if (!allowed.ok) {
      client.emit("chatError", { error: allowed.error });
      client.leave(room);
      return;
    }

    this.server.to(room).emit("chatMessage", {
      tableCode,
      username,
      message,
      ts: Date.now(),
    });
  }
}
