import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';

import { NotificationDeliveryEntity } from './entities/notification-delivery.entity';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';

type BrowserPushSubscription = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
};

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
};

export type QuestNotificationView = {
  key: string;
  title?: string;
  canClaim?: boolean;
  lastClaimedAt?: string | null;
  nextAvailableAt?: string | null;
  rewardCredits?: number;
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly subject: string;
  private readonly scheduledKeys = new Set<string>();

  constructor(
    private readonly config: ConfigService,

    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionsRepo: Repository<PushSubscriptionEntity>,

    @InjectRepository(NotificationDeliveryEntity)
    private readonly deliveriesRepo: Repository<NotificationDeliveryEntity>,
  ) {
    this.subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@the-river.local';
    const configuredPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const configuredPrivateKey = this.config.get<string>('VAPID_PRIVATE_KEY');

    if (configuredPublicKey && configuredPrivateKey) {
      this.publicKey = configuredPublicKey;
      this.privateKey = configuredPrivateKey;
    } else {
      const keys = webPush.generateVAPIDKeys();
      this.publicKey = keys.publicKey;
      this.privateKey = keys.privateKey;
      this.logger.warn('VAPID keys manquantes: cles temporaires generees pour le developpement.');
    }

    webPush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
  }

  async onModuleInit() {
    await this.ensureTables();
  }

  private async ensureTables() {
    try {
      await this.subscriptionsRepo.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id int NOT NULL AUTO_INCREMENT,
          userId int NOT NULL,
          endpoint varchar(500) NOT NULL,
          p256dh varchar(190) NOT NULL,
          auth varchar(120) NOT NULL,
          userAgent varchar(255) NULL,
          enabled tinyint NOT NULL DEFAULT 1,
          createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY IDX_push_subscriptions_endpoint (endpoint),
          KEY IDX_push_subscriptions_userId (userId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.deliveriesRepo.query(`
        CREATE TABLE IF NOT EXISTS notification_deliveries (
          id int NOT NULL AUTO_INCREMENT,
          userId int NOT NULL,
          dedupeKey varchar(190) NOT NULL,
          type varchar(80) NOT NULL,
          createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY UQ_notification_deliveries_user_key (userId, dedupeKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (err) {
      this.logger.warn(`Tables notifications non initialisees: ${(err as Error).message}`);
    }
  }

  getConfig() {
    return {
      enabled: Boolean(this.publicKey),
      publicKey: this.publicKey,
    };
  }

  async statusForUser(userId: number) {
    const count = await this.subscriptionsRepo.count({ where: { userId, enabled: true } as any });
    return {
      subscribed: count > 0,
      subscriptions: count,
    };
  }

  async upsertSubscription(userId: number, subscription: BrowserPushSubscription, userAgent?: string) {
    const endpoint = String(subscription.endpoint ?? '').trim();
    const p256dh = String(subscription.keys?.p256dh ?? '').trim();
    const auth = String(subscription.keys?.auth ?? '').trim();

    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('INVALID_PUSH_SUBSCRIPTION');
    }

    let row = await this.subscriptionsRepo.findOne({ where: { endpoint } as any });
    if (!row) {
      row = this.subscriptionsRepo.create({
        auth,
        enabled: true,
        endpoint,
        p256dh,
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
        userId,
      });
    } else {
      row.auth = auth;
      row.enabled = true;
      row.p256dh = p256dh;
      row.userAgent = userAgent ? userAgent.slice(0, 255) : row.userAgent;
      row.userId = userId;
    }

    await this.subscriptionsRepo.save(row);
    return this.statusForUser(userId);
  }

  async unsubscribe(userId: number, endpoint?: string) {
    if (endpoint) {
      await this.subscriptionsRepo.update({ userId, endpoint } as any, { enabled: false });
    } else {
      await this.subscriptionsRepo.update({ userId } as any, { enabled: false });
    }
    return this.statusForUser(userId);
  }

  async sendTest(userId: number) {
    return this.sendToUser(userId, {
      title: 'Notifications activees',
      body: 'THE RIVER pourra te prevenir pour les quetes et bonus importants.',
      tag: 'the-river-test',
      url: '/dashboard',
    });
  }

  async notifyQuestSnapshot(userId: number, quests: QuestNotificationView[]) {
    const claimable = quests.filter((quest) => quest.canClaim);
    if (claimable.length <= 0) return;

    const first = claimable[0];
    const dedupeKey = `quest-ready:${first.key}:${first.lastClaimedAt ?? 'first'}`;
    await this.sendToUser(
      userId,
      {
        title: claimable.length > 1 ? `${claimable.length} quetes sont pretes` : 'Quete prete',
        body:
          claimable.length > 1
            ? 'Passe sur le dashboard pour recuperer tes recompenses.'
            : `${first.title ?? 'Une quete'} peut etre recuperee (+${first.rewardCredits ?? 0} credits).`,
        tag: 'the-river-quest-ready',
        url: '/dashboard',
      },
      dedupeKey,
      'quest-ready',
    );
  }

  async notifyQuestClaimed(userId: number, quest: QuestNotificationView) {
    const reward = Number(quest.rewardCredits ?? 0);
    const dedupeKey = `quest-claimed:${quest.key}:${Date.now()}`;

    await this.sendToUser(
      userId,
      {
        title: 'Quete recuperee',
        body: `${quest.title ?? 'Ta quete'} ajoute ${reward} credits a ton solde.`,
        tag: 'the-river-quest-claimed',
        url: '/dashboard',
      },
      dedupeKey,
      'quest-claimed',
    );

    this.scheduleQuestRecharge(userId, quest);
  }

  scheduleQuestRecharge(userId: number, quest: QuestNotificationView) {
    if (!quest.nextAvailableAt) return;
    const target = new Date(quest.nextAvailableAt).getTime();
    const delay = target - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;

    const scheduleKey = `quest-recharge:${userId}:${quest.key}:${quest.nextAvailableAt}`;
    if (this.scheduledKeys.has(scheduleKey)) return;
    this.scheduledKeys.add(scheduleKey);

    windowlessSetTimeout(async () => {
      this.scheduledKeys.delete(scheduleKey);
      await this.sendToUser(
        userId,
        {
          title: 'Quete rechargee',
          body: `${quest.title ?? 'Une quete'} est de nouveau disponible.`,
          tag: 'the-river-quest-recharge',
          url: '/dashboard',
        },
        scheduleKey,
        'quest-recharge',
      );
    }, Math.min(delay, 2_147_000_000));
  }

  async sendToUser(
    userId: number,
    payload: PushPayload,
    dedupeKey?: string,
    type = 'generic',
  ) {
    if (dedupeKey) {
      const existing = await this.deliveriesRepo.findOne({ where: { userId, dedupeKey } as any });
      if (existing) return { sent: 0, skipped: true };
    }

    const rows = await this.subscriptionsRepo.find({
      where: { userId, enabled: true } as any,
    });

    if (rows.length <= 0) return { sent: 0 };

    const body = JSON.stringify({
      badge: payload.badge ?? '/assets/logo-the-river.png',
      body: payload.body,
      icon: payload.icon ?? '/assets/logo-the-river.png',
      tag: payload.tag ?? 'the-river',
      title: payload.title,
      url: payload.url ?? '/dashboard',
    });

    let sent = 0;
    for (const row of rows) {
      try {
        await webPush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              auth: row.auth,
              p256dh: row.p256dh,
            },
          },
          body,
        );
        sent += 1;
      } catch (err) {
        const statusCode = Number((err as { statusCode?: number }).statusCode ?? 0);
        if (statusCode === 404 || statusCode === 410) {
          await this.subscriptionsRepo.update({ id: row.id } as any, { enabled: false });
        } else {
          this.logger.warn(`Push non envoye (${statusCode || 'unknown'}): ${(err as Error).message}`);
        }
      }
    }

    if (dedupeKey && sent > 0) {
      await this.deliveriesRepo.save(this.deliveriesRepo.create({ dedupeKey, type, userId }));
    }

    return { sent };
  }
}

function windowlessSetTimeout(callback: () => void, delay: number) {
  return setTimeout(callback, delay);
}
