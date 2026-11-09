"use server";

import { revalidatePath } from "next/cache";
import {
  addReviewInStore,
  getAllStoredReviews,
  deleteReviewFromStore,
  StoredReview,
} from "@/lib/server-store";
import { ActionResult, ReviewActionInput } from "./types";
import { db } from "@/lib/firebase";
import { collection, doc, deleteDoc, getDocs, setDoc } from "firebase/firestore";

/**
 * Server Action to submit customer feedback and ratings.
 */
export async function submitReviewAction(
  input: ReviewActionInput
): Promise<ActionResult<StoredReview>> {
  try {
    const name = input.name?.trim();
    const comment = (input.commentEn || input.comment || input.commentSi || "").trim();
    const rawRating = Number(input.rating ?? input.stars ?? 5);
    const rating = Number.isFinite(rawRating) ? Math.min(5, Math.max(1, Math.round(rawRating))) : 5;
    const service = (input.route || input.service || input.role || "Island-wide Transport").trim();

    if (!name) {
      return { success: false, error: "Your name is required." };
    }
    if (!comment) {
      return { success: false, error: "Review feedback comment is required." };
    }

    const review = addReviewInStore({
      name,
      rating,
      comment,
      service,
    });

    // Cloud Firestore write (primary source of truth)
    try {
      const docRef = doc(db, "reviews", review.id);
      await setDoc(
        docRef,
        {
          id: review.id,
          name,
          role: input.role || "Verified Client",
          stars: rating,
          rating,
          route: input.route || service,
          service: input.route || service,
          comment,
          commentEn: input.commentEn || comment,
          commentSi: input.commentSi || comment,
          date: "Just now",
          createdAt: review.createdAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn("Firestore review sync notice:", cloudErr);
    }

    try {
      revalidatePath("/reviews");
      revalidatePath("/");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: review,
      message: "Thank you! Your review has been published.",
    };
  } catch (err: unknown) {
    console.error("submitReviewAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to publish review.",
    };
  }
}

/**
 * Server Action to fetch all reviews directly from Firestore.
 */
export async function getAllReviewsAction(): Promise<ActionResult<StoredReview[]>> {
  try {
    const colRef = collection(db, "reviews");
    const snap = await getDocs(colRef);
    const reviews: StoredReview[] = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || "Customer",
          rating: data.stars || data.rating || 5,
          comment: data.comment || data.commentEn || data.commentSi || "",
          service: data.route || data.service || "Island-wide Transport",
          createdAt: Number(data.createdAt) || 0,
        };
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return {
      success: true,
      data: reviews,
    };
  } catch (err: unknown) {
    console.error("getAllReviewsAction error:", err);
    return {
      success: false,
      error: "Failed to retrieve reviews.",
    };
  }
}

/**
 * Server Action to delete a review from Firestore and memory store.
 */
export async function deleteReviewAction(id: string): Promise<ActionResult<boolean>> {
  try {
    if (!id) {
      return { success: false, error: "Review ID is required." };
    }

    deleteReviewFromStore(id);

    try {
      await deleteDoc(doc(db, "reviews", id));
    } catch (e) {
      console.warn("Firestore delete review notice:", e);
    }

    try {
      revalidatePath("/reviews");
      revalidatePath("/");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: true,
    };
  } catch (err: unknown) {
    console.error("deleteReviewAction error:", err);
    return {
      success: false,
      error: "Failed to delete review.",
    };
  }
}
