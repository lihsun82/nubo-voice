import { createNubosciPmsQueryHandler } from "@/lib/nubosci-pms-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createNubosciPmsQueryHandler("rest");
