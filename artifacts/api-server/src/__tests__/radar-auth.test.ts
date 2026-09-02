import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAuth: vi.fn() }));
vi.mock("@clerk/express", () => ({ getAuth: mocks.getAuth }));

import { requireRadarAccess } from "../middlewares/radarAuth";

const getAuth = mocks.getAuth;

function response() {
  const res: any = {
    locals: {},
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
  return res;
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RADAR_AUTHORIZED_USER_IDS;
  process.env.NODE_ENV = "test";
});

describe("RadarOH authorization", () => {
  it("rejects anonymous requests", () => {
    getAuth.mockReturnValue({ userId: null });
    const res = response();
    requireRadarAccess({} as any, res, vi.fn());
    expect(res.statusCode).toBe(401);
  });

  it("fails closed in production without an allowlist", () => {
    process.env.NODE_ENV = "production";
    getAuth.mockReturnValue({ userId: "user_1" });
    const res = response();
    requireRadarAccess({} as any, res, vi.fn());
    expect(res.statusCode).toBe(503);
  });

  it("rejects users outside the configured allowlist", () => {
    process.env.RADAR_AUTHORIZED_USER_IDS = "user_2";
    getAuth.mockReturnValue({ userId: "user_1" });
    const res = response();
    requireRadarAccess({} as any, res, vi.fn());
    expect(res.statusCode).toBe(403);
  });

  it("allows explicitly authorized users", () => {
    process.env.RADAR_AUTHORIZED_USER_IDS = "user_1,user_2";
    getAuth.mockReturnValue({ userId: "user_1" });
    const res = response();
    const next = vi.fn();
    requireRadarAccess({} as any, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.radarUserId).toBe("user_1");
  });
});