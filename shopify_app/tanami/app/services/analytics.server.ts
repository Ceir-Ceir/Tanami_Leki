import db from "../db.server";

export interface DashboardMetrics {
    uniqueLeads: number;
    hvpCount: number;
    emailsCaptured: number;
    avgLeadScore: number;
    totalSessions: number;
}

export type LeadSegment = "HVP" | "SQL" | "MQL" | "ALL";

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
    const [uniqueLeads, hvpCount, emailsCaptured, avgScoreResult, totalSessions] = await Promise.all([
        db.leads.count(),
        db.leads.count({
            where: {
                lead_score: { gte: 150 },
            },
        }),
        db.leads.count({
            where: {
                NOT: [
                    { email: null },
                    { email: "" }
                ]
            },
        }),
        db.leads.aggregate({
            _avg: {
                lead_score: true,
            },
        }),
        db.sessions.count(),
    ]);

    return {
        uniqueLeads,
        hvpCount,
        emailsCaptured,
        avgLeadScore: Math.round(avgScoreResult._avg.lead_score || 0),
        totalSessions,
    };
}

export async function getLeads(segment: LeadSegment = "ALL") {
    const where: any = {};

    if (segment === "HVP") {
        where.lead_score = { gte: 150 };
    } else if (segment === "SQL") {
        where.stage = "SQL";
        where.lead_score = { gte: 100, lt: 150 };
    } else if (segment === "MQL") {
        where.stage = "MQL";
    }

    return await db.leads.findMany({
        where,
        orderBy: {
            lead_score: "desc",
        },
        take: 100, // Limit for performance
    });
}

export async function getRecentEvents(limit = 20) {
    return await db.events.findMany({
        orderBy: {
            created_at: "desc",
        },
        take: limit,
    });
}

export async function getLeadStageDistribution() {
    const groups = await db.leads.groupBy({
        by: ["stage"],
        _count: {
            id: true,
        },
    });

    return groups.map((g) => ({
        stage: g.stage || "UNKNOWN",
        count: g._count.id,
    }));
}

export async function getTopEventsAggregated() {
    try {
        // v_lead_profiles is a view, so we use queryRaw
        const result: any[] = await db.$queryRaw`SELECT top_events FROM v_lead_profiles`;

        const eventCounts: Record<string, number> = {};

        result.forEach((row) => {
            const events = row.top_events;
            // The structure is [{count: N, event_type: "name"}, ...]
            if (Array.isArray(events)) {
                events.forEach((item: any) => {
                    if (item.event_type && item.count) {
                        const type = item.event_type;
                        const count = parseInt(item.count, 10) || 0;
                        eventCounts[type] = (eventCounts[type] || 0) + count;
                    }
                });
            } else if (events && typeof events === "object") {
                // Fallback for key-value format {event_name: count}
                Object.entries(events).forEach(([type, count]) => {
                    eventCounts[type] = (eventCounts[type] || 0) + (parseInt(count as string, 10) || 0);
                });
            }
        });

        return Object.entries(eventCounts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15); // Top 15 for the dashboard
    } catch (error) {
        console.error("Failed to fetch top events aggregation:", error);
        return [];
    }
}

export async function getEventTrends() {
    const today = new Date();
    const result = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const startOfDay = new Date(d.setHours(0, 0, 0, 0));
        const endOfDay = new Date(d.setHours(23, 59, 59, 999));

        const count = await db.events.count({
            where: {
                created_at: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        result.push({
            date: startOfDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            count
        });
    }

    return result;
}

// ============ Lead Journey Analytics ============

export interface LeadJourneyData {
    avgSessionMinutes: number;
    avgSessionSeconds: number;
    referrerDistribution: { source: string; count: number; percentage: number }[];
    paidTrafficCount: number;
    totalSessions: number;
    paidPercentage: number;
    topReferrer: string;
}

export async function getLeadJourneyData(): Promise<LeadJourneyData> {
    try {
        // Get all sessions for analysis
        const sessions = await db.sessions.findMany({
            select: {
                duration_ms: true,
                referrer: true,
                utm_medium: true,
            }
        });

        const totalSessions = sessions.length;

        // Calculate average session duration
        // 1. Sum durations using BigInt to avoid precision loss with large numbers
        let totalDurationMs = BigInt(0);
        sessions.forEach(s => {
            totalDurationMs += s.duration_ms || BigInt(0);
        });

        // 2. Convert BigInt to Number and calculate average in milliseconds
        const avgDurationMs = totalSessions > 0
            ? Number(totalDurationMs) / totalSessions
            : 0;

        // 3. Convert to seconds for the seconds display
        const avgSessionSeconds = Math.round(avgDurationMs / 100000);

        // 4. Convert to minutes and format to 2 decimal places
        // Divide by 6,000,000 (60000 * 100) to correct scaling
        const avgSessionMinutes = parseFloat((avgDurationMs / 6000000).toFixed(2));

        // Calculate referrer distribution
        const referrerCounts: Record<string, number> = {};
        sessions.forEach(s => {
            let source = s.referrer || "(direct)";
            // Normalize referrer to domain name
            if (source && source !== "(direct)") {
                try {
                    const url = new URL(source);
                    source = url.hostname.replace(/^www\./, "");
                } catch {
                    // Keep as-is if not a valid URL
                }
            }
            referrerCounts[source] = (referrerCounts[source] || 0) + 1;
        });

        const referrerDistribution = Object.entries(referrerCounts)
            .map(([source, count]) => ({
                source,
                count,
                percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10 sources

        // Calculate paid traffic (utm_medium = "paid")
        const paidTrafficCount = sessions.filter(s =>
            s.utm_medium?.toLowerCase() === "paid" ||
            s.utm_medium?.toLowerCase() === "cpc" ||
            s.utm_medium?.toLowerCase() === "ppc"
        ).length;
        const paidPercentage = totalSessions > 0
            ? Math.round((paidTrafficCount / totalSessions) * 100)
            : 0;

        // Get top referrer (first in sorted distribution)
        const topReferrer = referrerDistribution.length > 0 ? referrerDistribution[0].source : "(none)";

        return {
            avgSessionMinutes,
            avgSessionSeconds,
            referrerDistribution,
            paidTrafficCount,
            totalSessions,
            paidPercentage,
            topReferrer
        };
    } catch (error) {
        console.error("Failed to fetch lead journey data:", error);
        return {
            avgSessionMinutes: 0,
            avgSessionSeconds: 0,
            referrerDistribution: [],
            paidTrafficCount: 0,
            totalSessions: 0,
            paidPercentage: 0,
            topReferrer: "(none)"
        };
    }
}
