import { NextResponse } from "next/server";
import { addReviewInStore, deleteReviewFromStore } from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";

export async function GET() {
  try {
    const colRef = collection(db, "reviews");
    const snap = await getDocs(colRef);
    const reviews = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || "Customer",
          rating: data.stars || data.rating || 5,
          comment: data.comment || data.commentEn || data.commentSi || "",
          service: data.route || data.service || "Island-wide Transport",
          date: data.date || "Recently",
          createdAt: Number(data.createdAt) || 0,
        };
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return NextResponse.json({ success: true, reviews });
  } catch {
    return NextResponse.json({ success: true, reviews: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, rating, comment, service, role } = body;

    if (!name || !comment) {
      return NextResponse.json(
        { success: false, error: "Name and comment are required." },
        { status: 400 }
      );
    }

    const review = await addReviewInStore({
      name,
      rating: Number(rating) || 5,
      comment,
      service: service || "Island-wide Transport",
    });

    try {
      const docRef = doc(db, "reviews", review.id);
      await setDoc(
        docRef,
        {
          id: review.id,
          name,
          role: role || "Verified Client",
          stars: Number(rating) || 5,
          rating: Number(rating) || 5,
          route: service || "Island-wide Transport",
          service: service || "Island-wide Transport",
          comment,
          commentEn: comment,
          commentSi: comment,
          date: "Just now",
          createdAt: review.createdAt,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("Firestore sync notice for review POST:", e);
    }

    return NextResponse.json({ success: true, review });
  } catch (error: unknown) {
    const errMessage =
      error instanceof Error ? error.message : "Failed to submit review";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Review ID is required." },
        { status: 400 }
      );
    }

    await deleteReviewFromStore(id);

    try {
      await deleteDoc(doc(db, "reviews", id));
    } catch (e) {
      console.warn("Firestore delete review notice:", e);
    }

    return NextResponse.json({ success: true, message: "Review deleted successfully." });
  } catch (error: unknown) {
    const errMessage =
      error instanceof Error ? error.message : "Failed to delete review";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}
