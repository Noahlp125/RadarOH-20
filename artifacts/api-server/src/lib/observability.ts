const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type HttpLabels = { method: string; route: string; status: string };
type WorkerKind = "monitor" | "ai" | "unknown";
type WorkerStatus = "success" | "error";

const httpRequests = new Map<string, number>();
const httpErrors = new Map<string, number>();
const httpDurations = new Map<string, { count: number; sum: number; buckets: number[] }>();
const workerTicks = new Map<string, number>();
const workerJobs = new Map<string, number>();
let workerFailures = 0;
let leaseAcquisitions = 0;
let leaseLosses = 0;
let jobsRecovered = 0;
let ready = false;
let workerLeader = 0;
let activeJobs = 0;

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function labels(labels: Record<string, string>) {
  return Object.entries(labels).map(([key, value]) => `${key}="${value}"`).join(",");
}

function metricLines(name: string, map: Map<string, number>) {
  return [...map.entries()].map(([key, value]) => `${name}{${key}} ${value}`);
}

export function safeRoute(path: string) {
  const pathname = path.split("?")[0] ?? "";
  if (pathname === "/healthz" || pathname === "/readyz" || pathname === "/metrics") {
    return `/api${pathname}`;
  }
  if (pathname === "/api/healthz" || pathname === "/api/readyz" || pathname === "/api/metrics") return pathname;
  if (pathname.startsWith("/api/radar/")) return "/api/radar/*";
  if (pathname.startsWith("/api/")) return "/api/*";
  return "other";
}

export function recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number) {
  const httpLabels: HttpLabels = {
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(method) ? method : "OTHER",
    route: safeRoute(path),
    status: `${Math.floor(statusCode / 100)}xx`,
  };
  const key = labels(httpLabels);
  increment(httpRequests, key);
  if (statusCode >= 500) increment(httpErrors, key);
  const duration = Math.max(0, durationMs / 1_000);
  const histogram = httpDurations.get(key) ?? { count: 0, sum: 0, buckets: HTTP_DURATION_BUCKETS.map(() => 0) };
  histogram.count += 1;
  histogram.sum += duration;
  HTTP_DURATION_BUCKETS.forEach((bucket, index) => {
    if (duration <= bucket) histogram.buckets[index]! += 1;
  });
  httpDurations.set(key, histogram);
}

export function recordWorkerTick(status: WorkerStatus) {
  increment(workerTicks, labels({ status }));
  if (status === "error") workerFailures += 1;
}

export function recordWorkerJob(kind: string, status: WorkerStatus) {
  const safeKind: WorkerKind = kind === "monitor" || kind === "ai" ? kind : "unknown";
  increment(workerJobs, labels({ kind: safeKind, status }));
}

export function recordLeaseAcquisition() { leaseAcquisitions += 1; }
export function recordLeaseLoss() { leaseLosses += 1; }
export function recordRecoveredJobs(count: number) { jobsRecovered += Math.max(0, count); }
export function setReadiness(value: boolean) { ready = value; }
export function setWorkerLeader(value: boolean) { workerLeader = value ? 1 : 0; }
export function setActiveJobs(value: number) { activeJobs = Math.max(0, value); }

export function renderMetrics() {
  const lines = [
    "# HELP radar_http_requests_total HTTP requests completed.",
    "# TYPE radar_http_requests_total counter",
    ...metricLines("radar_http_requests_total", httpRequests),
    "# HELP radar_http_errors_total HTTP server errors completed.",
    "# TYPE radar_http_errors_total counter",
    ...metricLines("radar_http_errors_total", httpErrors),
    "# HELP radar_http_request_duration_seconds HTTP request duration.",
    "# TYPE radar_http_request_duration_seconds histogram",
  ];
  for (const [key, value] of httpDurations) {
    HTTP_DURATION_BUCKETS.forEach((bucket, index) => lines.push(`radar_http_request_duration_seconds_bucket{${key},le="${bucket}"} ${value.buckets[index]}`));
    lines.push(`radar_http_request_duration_seconds_bucket{${key},le="+Inf"} ${value.count}`);
    lines.push(`radar_http_request_duration_seconds_sum{${key}} ${value.sum}`);
    lines.push(`radar_http_request_duration_seconds_count{${key}} ${value.count}`);
  }
  lines.push(
    "# TYPE radar_worker_ticks_total counter",
    ...metricLines("radar_worker_ticks_total", workerTicks),
    "# TYPE radar_worker_failures_total counter",
    `radar_worker_failures_total ${workerFailures}`,
    "# TYPE radar_worker_jobs_processed_total counter",
    ...metricLines("radar_worker_jobs_processed_total", workerJobs),
    "# TYPE radar_worker_lease_acquisitions_total counter",
    `radar_worker_lease_acquisitions_total ${leaseAcquisitions}`,
    "# TYPE radar_worker_lease_losses_total counter",
    `radar_worker_lease_losses_total ${leaseLosses}`,
    "# TYPE radar_worker_jobs_recovered_total counter",
    `radar_worker_jobs_recovered_total ${jobsRecovered}`,
    "# TYPE radar_readiness gauge",
    `radar_readiness ${ready ? 1 : 0}`,
    "# TYPE radar_worker_leader gauge",
    `radar_worker_leader ${workerLeader}`,
    "# TYPE radar_worker_active_jobs gauge",
    `radar_worker_active_jobs ${activeJobs}`,
    "",
  );
  return lines.join("\n");
}