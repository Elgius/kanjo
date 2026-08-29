import { can, canAccessRegister, getAuthorization } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { getPrivateObject } from "@/lib/storage/bunny-s3";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext<"/api/payment-slips/[billId]">,
) {
  const { billId } = await context.params;
  if (!uuidPattern.test(billId)) return new Response("Not found", { status: 404 });

  const authorization = await getAuthorization();
  if (!authorization) return new Response("Unauthorized", { status: 401 });

  const paymentLink = await prisma.paymentLink.findUnique({
    where: { billId },
    select: {
      paymentSlipKey: true,
      paymentSlipFileName: true,
      paymentSlipContentType: true,
      bill: { select: { registerId: true } },
    },
  });
  const canViewBills = can(authorization, "REGISTERS_VIEW")
    || can(authorization, "REGISTER_SESSIONS_VIEW")
    || can(authorization, "BILL_HISTORY_VIEW");
  if (
    !paymentLink?.paymentSlipKey
    || !paymentLink.paymentSlipFileName
    || !paymentLink.paymentSlipContentType
    || !canViewBills
    || !canAccessRegister(authorization, paymentLink.bill.registerId)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const object = await getPrivateObject(paymentLink.paymentSlipKey);
    const bytes = Uint8Array.from(object.bytes);
    const fileName = encodeURIComponent(paymentLink.paymentSlipFileName);
    return new Response(bytes.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${fileName}`,
        "Content-Length": String(object.contentLength ?? bytes.byteLength),
        "Content-Type": object.contentType ?? paymentLink.paymentSlipContentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to retrieve a payment slip from Bunny S3.", error);
    return new Response("Payment slip unavailable", { status: 502 });
  }
}
