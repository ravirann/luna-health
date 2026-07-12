'use client';

// MemoryLane — vertical timeline of past conversations. Initial batch
// renders server-side via the parent page; this component owns search,
// infinite scroll, and emotional grouping.
//
// Each "row" is a soft, low-contrast strip (not a card). Rows are grouped
// into time buckets that render as a single continuous lane with a
// subtle vertical line on the left.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLineSummary,
  pickFallbackTitle,
  reflectionTitle,
  type Facts,
} from '@/lib/session-title';
import { bucketFor, BUCKET_HUE } from '@/lib/time-of-day';
import { getAppCopy, interpolate, type AppLocale } from '@/lib/i18n';

export type LaneItem = {
  id: string;
  sceneId: string | null;
  personaId: string | null;
  startedAt: string; // ISO
  durationSecs: number | null;
  facts: Facts | null;
  freeText: string | null;
};

type Group = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'earlier';

const IST_TZ = 'Asia/Kolkata';

function ist(d: Date) {
  return new Date(
    new Intl.DateTimeFormat('en-US', {
      timeZone: IST_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(d)
      .replace(',', ''),
  );
}

function groupFor(d: Date): Group {
  const a = ist(d);
  const b = ist(new Date());
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  const dayDiff = Math.round((bDay - aDay) / 86400000);
  if (dayDiff <= 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return 'this_week';
  if (dayDiff < 14) return 'last_week';
  return 'earlier';
}

function groupLabel(copy: ReturnType<typeof getAppCopy>['memoryLane'], group: Group): string {
  if (group === 'this_week') return copy.groups.thisWeek;
  if (group === 'last_week') return copy.groups.lastWeek;
  return copy.groups[group];
}

function relativeIst(d: Date, locale?: AppLocale): string {
  const a = ist(d);
  const b = ist(new Date());
  const sameDay =
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
  const yesterday = new Date(b);
  yesterday.setUTCDate(b.getUTCDate() - 1);
  const isYesterday =
    a.getUTCFullYear() === yesterday.getUTCFullYear() &&
    a.getUTCMonth() === yesterday.getUTCMonth() &&
    a.getUTCDate() === yesterday.getUTCDate();
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  const copy = getAppCopy(locale).memoryLane;
  if (sameDay) return interpolate(copy.relativeToday, { time });
  if (isYesterday) return interpolate(copy.relativeYesterday, { time });
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function fmtDuration(secs: number | null, locale?: AppLocale): string {
  const copy = getAppCopy(locale).memoryLane;
  if (!secs || secs <= 0) return '';
  if (secs < 60) return copy.durationLessThanMinute;
  const m = Math.floor(secs / 60);
  return m === 1 ? copy.durationOneMinute : interpolate(copy.durationMinutes, { minutes: m });
}

const SHORT_SESSION_SECS = 10;
const TITLE_WINDOW = 8;

type DecoratedItem = {
  raw: LaneItem;
  startedAt: Date;
  group: Group;
  hue: string;
  title: string;
  meta: string;
  summary: string | null;
  searchBlob: string;
};

function decorate(items: LaneItem[], locale?: AppLocale): DecoratedItem[] {
  const window: string[] = [];
  return items.map((it) => {
    const startedAt = new Date(it.startedAt);
    const bucket = bucketFor(startedAt);
    const hue = BUCKET_HUE[bucket].hue;
    const refl = reflectionTitle(it.facts, it.sceneId, it.durationSecs);
    const title = refl ?? pickFallbackTitle(bucket, new Set(window));
    window.push(title);
    if (window.length > TITLE_WINDOW) window.shift();

    const dur = fmtDuration(it.durationSecs, locale);
    const relative = relativeIst(startedAt, locale);
    const meta = dur ? `${relative} · ${dur}` : relative;
    const summary = buildLineSummary(it.facts, it.freeText);

    const themesBlob = it.facts && Array.isArray((it.facts as Facts).themes)
      ? ((it.facts as Facts).themes as unknown[]).filter((x) => typeof x === 'string').join(' ')
      : '';
    const moodBlob = it.facts && typeof (it.facts as Facts).mood === 'string'
      ? ((it.facts as Facts).mood as string)
      : '';
    const searchBlob = [
      title,
      summary ?? '',
      themesBlob,
      moodBlob,
      it.freeText ?? '',
      meta,
      bucket,
    ]
      .join(' ')
      .toLowerCase();

    return {
      raw: it,
      startedAt,
      group: groupFor(startedAt),
      hue,
      title,
      meta,
      summary,
      searchBlob,
    };
  });
}

export function MemoryLane({
  initialItems,
  initialCursor,
  initialHasMore,
  locale,
}: {
  initialItems: LaneItem[];
  initialCursor: string | null;
  initialHasMore: boolean;
  locale?: AppLocale;
}) {
  const copy = getAppCopy(locale).memoryLane;
  const [items, setItems] = useState<LaneItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Hide blink-of-an-eye sessions — same rule as profile page.
  const decorated = useMemo(
    () => decorate(items.filter((i) => (i.durationSecs ?? 0) >= SHORT_SESSION_SECS), locale),
    [items, locale],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return decorated;
    return decorated.filter((d) => d.searchBlob.includes(q));
  }, [decorated, query]);

  const groupedOrder: Group[] = ['today', 'yesterday', 'this_week', 'last_week', 'earlier'];
  const grouped = useMemo(() => {
    const out: Record<Group, DecoratedItem[]> = {
      today: [],
      yesterday: [],
      this_week: [],
      last_week: [],
      earlier: [],
    };
    for (const d of filtered) out[d.group].push(d);
    return out;
  }, [filtered]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !cursor) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sessions?cursor=${encodeURIComponent(cursor)}&limit=20`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        items: LaneItem[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch {
      // soft-fail; user can scroll again to retry
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, cursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const totalVisible = filtered.length;
  const noSearchResults = query.trim().length > 0 && totalVisible === 0;

  return (
    <div className="lane">
      <div className="lane__search">
        <input
          type="search"
          className="lane__search-input"
          placeholder={copy.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={copy.searchLabel}
        />
      </div>

      {noSearchResults ? (
        <div className="lane__empty">
          <h3 className="lane__empty-title">{copy.noResultsTitle}</h3>
          <p className="lane__empty-sub">
            {copy.noResultsSubcopy}
          </p>
        </div>
      ) : (
        <div className="lane__timeline">
          {groupedOrder.map((g) => {
            const rows = grouped[g];
            if (rows.length === 0) return null;
            return (
              <section key={g} className="lane__group">
                <h3 className="lane__group-label">{groupLabel(copy, g)}</h3>
                <ul className="lane__list">
                  {rows.map((d) => (
                    <li
                      key={d.raw.id}
                      className="lane__row"
                      style={{ ['--lane-hue' as string]: d.hue }}
                    >
                      <Link
                        href={`/profile/history/${d.raw.id}`}
                        className="lane__row-link"
                      >
                        <span className="lane__branch" aria-hidden />
                        <span className="lane__dot" aria-hidden />
                        <div className="lane__body">
                          <div className="lane__title">{d.title}</div>
                          <div className="lane__meta">{d.meta}</div>
                          {d.summary && (
                            <div className="lane__summary">{d.summary}</div>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div ref={sentinelRef} className="lane__sentinel" aria-hidden />
          {loading && (
            <p className="lane__status">{copy.loading}</p>
          )}
          {!loading && !hasMore && items.length > 0 && (
            <p className="lane__status lane__status--end">
              {copy.end}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
