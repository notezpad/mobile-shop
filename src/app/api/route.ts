import { withDb } from '@/lib/db'
import { NextResponse } from "next/server";

async function __GET() {
  return NextResponse.json({ message: "Hello, world!" });
}
export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
