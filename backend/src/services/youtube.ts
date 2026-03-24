import { google } from 'googleapis'
import type { YoutubeAccount } from '../db/schema'

// Tokens emitted by the OAuth2 client on refresh
export interface RefreshedTokens {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
}

export interface BroadcastDetails {
  broadcastId: string
  title: string
  lifeCycleStatus: string
  privacyStatus: string
  scheduledStartTime?: string | null
  actualStartTime?: string | null
  actualEndTime?: string | null
  watchUrl: string
  boundStreamId?: string | null
}

export interface BroadcastWithIngestion extends BroadcastDetails {
  streamId: string
  rtmpUrl: string
  streamKey: string
}

export interface StreamIngestionInfo {
  streamId: string
  rtmpUrl: string
  streamKey: string
  streamStatus?: string | null
}

function makeOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars are required')
  }
  const redirectUri =
    process.env.YOUTUBE_REDIRECT_URI ?? 'http://localhost:3000/api/youtube/callback'
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function generateAuthUrl(state: string): string {
  const auth = makeOAuth2Client()
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
    prompt: 'consent', // ensures refresh_token is always returned
  })
}

export interface OAuthProfile {
  tokens: { access_token: string; refresh_token?: string | null; expiry_date?: number | null }
  channelId: string
  channelTitle: string
  email: string
}

export async function exchangeCodeAndFetchProfile(code: string): Promise<OAuthProfile> {
  const auth = makeOAuth2Client()
  const { tokens } = await auth.getToken(code)
  if (!tokens.access_token) throw new Error('No access token in Google response')

  auth.setCredentials(tokens)
  const yt = google.youtube({ version: 'v3', auth })
  const oauth2 = google.oauth2({ version: 'v2', auth })

  const [channelRes, userinfoRes] = await Promise.all([
    yt.channels.list({ part: ['snippet'], mine: true }),
    oauth2.userinfo.get(),
  ])

  const channel = channelRes.data.items?.[0]
  if (!channel?.id || !channel.snippet?.title) {
    throw new Error('No YouTube channel found for this Google account')
  }

  return {
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
    },
    channelId: channel.id,
    channelTitle: channel.snippet.title,
    email: userinfoRes.data.email ?? '',
  }
}

export class YouTubeService {
  private auth: ReturnType<typeof makeOAuth2Client>
  private yt: ReturnType<typeof google.youtube>

  constructor(
    account: YoutubeAccount,
    private onTokensRefreshed: (tokens: RefreshedTokens) => Promise<void>,
  ) {
    this.auth = makeOAuth2Client()
    this.auth.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken ?? undefined,
      expiry_date: account.expiryDate ?? undefined,
    })
    // Persist refreshed tokens so they survive server restarts
    this.auth.on('tokens', (tokens) => {
      void this.onTokensRefreshed(tokens)
    })
    this.yt = google.youtube({ version: 'v3', auth: this.auth })
  }

  async createBroadcastWithStream(opts: {
    title: string
    description?: string
    scheduledStartTime: string
    privacyStatus?: 'public' | 'private' | 'unlisted'
  }): Promise<BroadcastWithIngestion> {
    // 1 — create broadcast
    const bRes = await this.yt.liveBroadcasts.insert({
      part: ['snippet', 'status', 'contentDetails'],
      requestBody: {
        snippet: {
          title: opts.title,
          description: opts.description ?? '',
          scheduledStartTime: opts.scheduledStartTime,
        },
        status: { privacyStatus: opts.privacyStatus ?? 'private' },
        contentDetails: { enableAutoStart: false, enableAutoStop: false },
      },
    })
    const b = bRes.data

    // 2 — create stream (ingestion point)
    const sRes = await this.yt.liveStreams.insert({
      part: ['snippet', 'cdn', 'contentDetails'],
      requestBody: {
        snippet: { title: opts.title },
        cdn: { frameRate: 'variable', ingestionType: 'rtmp', resolution: 'variable' },
        contentDetails: { isReusable: false },
      },
    })
    const s = sRes.data

    // 3 — bind stream → broadcast
    await this.yt.liveBroadcasts.bind({ part: ['id'], id: b.id!, streamId: s.id! })

    return {
      broadcastId: b.id!,
      title: b.snippet!.title!,
      lifeCycleStatus: b.status!.lifeCycleStatus!,
      privacyStatus: b.status!.privacyStatus!,
      scheduledStartTime: b.snippet!.scheduledStartTime ?? null,
      actualStartTime: null,
      actualEndTime: null,
      watchUrl: `https://www.youtube.com/watch?v=${b.id}`,
      boundStreamId: s.id!,
      streamId: s.id!,
      rtmpUrl: s.cdn!.ingestionInfo!.ingestionAddress!,
      streamKey: s.cdn!.ingestionInfo!.streamName!,
    }
  }

  async listBroadcasts(
    broadcastStatus: 'upcoming' | 'active' | 'completed' | 'all' = 'all',
  ): Promise<BroadcastDetails[]> {
    const res = await this.yt.liveBroadcasts.list({
      part: ['snippet', 'status', 'contentDetails'],
      broadcastStatus,
      broadcastType: 'all',
      maxResults: 50,
    })
    return (res.data.items ?? []).map((b) => ({
      broadcastId: b.id!,
      title: b.snippet!.title!,
      lifeCycleStatus: b.status!.lifeCycleStatus!,
      privacyStatus: b.status!.privacyStatus!,
      scheduledStartTime: b.snippet!.scheduledStartTime ?? null,
      actualStartTime: b.snippet!.actualStartTime ?? null,
      actualEndTime: b.snippet!.actualEndTime ?? null,
      watchUrl: `https://www.youtube.com/watch?v=${b.id}`,
      boundStreamId: b.contentDetails?.boundStreamId ?? null,
    }))
  }

  async getBroadcast(broadcastId: string): Promise<BroadcastDetails> {
    const res = await this.yt.liveBroadcasts.list({
      part: ['snippet', 'status', 'contentDetails'],
      id: [broadcastId],
    })
    const b = res.data.items?.[0]
    if (!b) throw new Error(`Broadcast "${broadcastId}" not found`)
    return {
      broadcastId: b.id!,
      title: b.snippet!.title!,
      lifeCycleStatus: b.status!.lifeCycleStatus!,
      privacyStatus: b.status!.privacyStatus!,
      scheduledStartTime: b.snippet!.scheduledStartTime ?? null,
      actualStartTime: b.snippet!.actualStartTime ?? null,
      actualEndTime: b.snippet!.actualEndTime ?? null,
      watchUrl: `https://www.youtube.com/watch?v=${b.id}`,
      boundStreamId: b.contentDetails?.boundStreamId ?? null,
    }
  }

  async transitionBroadcast(
    broadcastId: string,
    broadcastStatus: 'testing' | 'live' | 'complete',
  ): Promise<{ broadcastId: string; lifeCycleStatus: string }> {
    const res = await this.yt.liveBroadcasts.transition({
      part: ['status'],
      broadcastStatus,
      id: broadcastId,
    })
    return { broadcastId: res.data.id!, lifeCycleStatus: res.data.status!.lifeCycleStatus! }
  }

  async deleteBroadcast(broadcastId: string): Promise<void> {
    await this.yt.liveBroadcasts.delete({ id: broadcastId })
  }

  async getStreamIngestionInfo(streamId: string): Promise<StreamIngestionInfo> {
    const res = await this.yt.liveStreams.list({ part: ['cdn', 'status'], id: [streamId] })
    const s = res.data.items?.[0]
    if (!s) throw new Error(`Stream "${streamId}" not found`)
    return {
      streamId: s.id!,
      rtmpUrl: s.cdn!.ingestionInfo!.ingestionAddress!,
      streamKey: s.cdn!.ingestionInfo!.streamName!,
      streamStatus: s.status?.streamStatus ?? null,
    }
  }
}
