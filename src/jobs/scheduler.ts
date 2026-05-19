import { trendingQueue } from './queue';

export async function registerSchedules() {
  try {
    await trendingQueue.upsertJobScheduler(
      'trending-daily',
      {
        pattern: '0 0,12 * * *',
      },
      {
        name: 'scrape-trending',
        data: { period: 'daily' },
      }
    );

    await trendingQueue.upsertJobScheduler(
      'trending-weekly',
      {
        pattern: '0 1 * * 1',
      },
      {
        name: 'scrape-trending',
        data: { period: 'weekly' },
      }
    );

    await trendingQueue.upsertJobScheduler(
      'trending-monthly',
      {
        pattern: '0 2 1 * *',
      },
      {
        name: 'scrape-trending',
        data: { period: 'monthly' },
      }
    );

    console.log('BullMQ schedules registered');
  } catch (err) {
    console.error('Failed to register BullMQ schedules:', err);
  }
}
