import { publicPhoto } from "@/lib/public-fleet";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const photo = await publicPhoto(params.get("id") || "", Number(params.get("n") || 0));
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.type,
      "X-Content-Type-Options": "nosniff",
      // The address changes when the photo does
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
