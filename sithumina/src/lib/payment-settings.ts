import { db } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

export interface BankAccountSetting {
  id: string;
  bankName: string;
  branch: string;
  accountName: string;
  accountNumber: string;
  active: boolean;
}

export interface PaymentSlipRecord {
  id: string;
  bookingId: string;
  customerPhone: string;
  customerName: string;
  amount: number;
  bankAccountUsed: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkCount: number;
  dataUrl: string;
  status: "pending_review" | "approved" | "rejected";
  uploadedAt: number;
  updatedAt: number;
}

const SETTINGS_COL = "settings";
const PAYMENT_ACCOUNTS_DOC = "payment_accounts";
const SLIPS_COL = "payment_slips";
const CHUNK_CHAR_SIZE = 480000;
const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB PDF limit
const MAX_RAW_IMAGE_BYTES = 12 * 1024 * 1024; // compressed down before DB save

/**
 * Dummy bank account defaults — seeded ONLY into Settings -> Bank Accounts
 * when the `settings/payment_accounts` document does not yet exist in Firestore.
 */
export const DEFAULT_DUMMY_BANK_ACCOUNTS: BankAccountSetting[] = [
  {
    id: "bank-1",
    bankName: "Bank of Ceylon (BOC)",
    branch: "Peliyagoda Branch",
    accountName: "Sithumina Transport (Pvt) Ltd",
    accountNumber: "0084 5678 9012",
    active: true,
  },
  {
    id: "bank-2",
    bankName: "Commercial Bank of Ceylon",
    branch: "Kiribathgoda Branch",
    accountName: "Sithumina Transport (Pvt) Ltd",
    accountNumber: "8012 3456 7890",
    active: true,
  },
];

function sanitizeBankAccounts(raw: unknown): BankAccountSetting[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any, idx: number) => ({
    id: String(item?.id || `bank-${idx + 1}`),
    bankName: String(item?.bankName || ""),
    branch: String(item?.branch || ""),
    accountName: String(item?.accountName || ""),
    accountNumber: String(item?.accountNumber || ""),
    active: item?.active !== false,
  }));
}

/**
 * Fetch configured bank accounts from Firestore (auto-seeding the 2 dummy
 * accounts on very first run if `settings/payment_accounts` does not exist).
 */
export async function getPaymentBankAccounts(): Promise<BankAccountSetting[]> {
  try {
    const ref = doc(db, SETTINGS_COL, PAYMENT_ACCOUNTS_DOC);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const seeded = DEFAULT_DUMMY_BANK_ACCOUNTS;
      await setDoc(ref, {
        accounts: seeded,
        updatedAt: Date.now(),
        seededDefaults: true,
      });
      return seeded;
    }
    const parsed = sanitizeBankAccounts(snap.data()?.accounts);
    return parsed.length > 0 ? parsed : DEFAULT_DUMMY_BANK_ACCOUNTS;
  } catch (err) {
    console.warn("getPaymentBankAccounts fallback:", err);
    return DEFAULT_DUMMY_BANK_ACCOUNTS;
  }
}

/**
 * Save admin bank accounts permanently to Firestore (`settings/payment_accounts`).
 */
export async function savePaymentBankAccounts(
  accounts: BankAccountSetting[]
): Promise<BankAccountSetting[]> {
  const cleaned = sanitizeBankAccounts(accounts);
  const ref = doc(db, SETTINGS_COL, PAYMENT_ACCOUNTS_DOC);
  await setDoc(
    ref,
    {
      accounts: cleaned,
      updatedAt: Date.now(),
      seededDefaults: false,
    },
    { merge: true }
  );
  return cleaned;
}

/**
 * Real-time subscription to Bank Account settings in Firestore.
 * Automatically seeds the 2 dummy bank accounts in Firestore on first read if absent.
 */
export function subscribePaymentBankAccounts(
  callback: (accounts: BankAccountSetting[]) => void
): () => void {
  let active = true;
  const ref = doc(db, SETTINGS_COL, PAYMENT_ACCOUNTS_DOC);

  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (!active) return;
      if (!snap.exists()) {
        void setDoc(ref, {
          accounts: DEFAULT_DUMMY_BANK_ACCOUNTS,
          updatedAt: Date.now(),
          seededDefaults: true,
        }).catch(() => {});
        callback(DEFAULT_DUMMY_BANK_ACCOUNTS);
        return;
      }
      const parsed = sanitizeBankAccounts(snap.data()?.accounts);
      callback(parsed.length > 0 ? parsed : DEFAULT_DUMMY_BANK_ACCOUNTS);
    },
    () => {
      if (active) callback(DEFAULT_DUMMY_BANK_ACCOUNTS);
    }
  );

  return () => {
    active = false;
    unsub();
  };
}

/**
 * Convert an uploaded File (PDF or Image) into a Firestore-ready Data URL
 * cleanly on the client without saving anything to localhost disk.
 */
export async function prepareSlipFilePayload(file: File): Promise<{
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
}> {
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(lowerName);

  if (!isPdf && !isImage) {
    throw new Error("Only PDF documents and Image slips (JPG, PNG, WEBP) are allowed.");
  }

  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error("PDF file size must be 5 MB or smaller.");
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read PDF file."));
      reader.readAsDataURL(file);
    });
    if (!dataUrl.startsWith("data:application/pdf")) {
      const base64Part = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      return {
        fileName: file.name,
        mimeType: "application/pdf",
        fileSize: file.size,
        dataUrl: `data:application/pdf;base64,${base64Part}`,
      };
    }
    return {
      fileName: file.name,
      mimeType: "application/pdf",
      fileSize: file.size,
      dataUrl,
    };
  }

  if (file.size > MAX_RAW_IMAGE_BYTES) {
    throw new Error("Image file size must be 12 MB or smaller.");
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

  // Compress large camera photos via Canvas so Firestore doc stays crisp and fast
  if (rawDataUrl.length <= 420000) {
    return {
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      fileSize: file.size,
      dataUrl: rawDataUrl,
    };
  }

  const compressedUrl = await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1600;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });

  return {
    fileName: file.name,
    mimeType: "image/jpeg",
    fileSize: Math.round((compressedUrl.length * 3) / 4),
    dataUrl: compressedUrl,
  };
}

/**
 * Helper: delete a slip document and all its chunk subcollection docs from Firestore.
 */
async function deleteSlipDocAndChunks(slipId: string): Promise<void> {
  if (!slipId) return;
  try {
    const chunksSnap = await getDocs(collection(db, SLIPS_COL, slipId, "chunks"));
    await Promise.all(chunksSnap.docs.map((c) => deleteDoc(c.ref)));
  } catch {
    // Non-blocking
  }
  await deleteDoc(doc(db, SLIPS_COL, slipId));
}

/**
 * Save a Customer's Payment Slip (PDF or Image) directly into Cloud Firestore DB
 * (using automatic chunking when >480KB so multi-page PDFs succeed cleanly with zero
 * localhost disk writes) and update the booking to `payment_submitted`.
 */
export async function uploadPaymentSlipToDb(params: {
  bookingId: string;
  customerPhone: string;
  customerName: string;
  amount: number;
  bankAccountUsed: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
}): Promise<{ slipId: string; uploadedAt: number }> {
  const now = Date.now();
  const slipId = `slip-${params.bookingId}-${now}`;

  // Clean up any pre-existing slip records for this booking so DB doesn't accumulate duplicates
  try {
    const oldSnap = await getDocs(
      query(
        collection(db, SLIPS_COL),
        where("bookingId", "==", params.bookingId),
        where("customerPhone", "==", params.customerPhone)
      )
    );
    await Promise.all(oldSnap.docs.map((d) => deleteSlipDocAndChunks(d.id)));
  } catch {
    // Non-blocking
  }

  const totalLen = params.dataUrl.length;
  const chunks: string[] = [];
  for (let i = 0; i < totalLen; i += CHUNK_CHAR_SIZE) {
    chunks.push(params.dataUrl.slice(i, i + CHUNK_CHAR_SIZE));
  }
  const chunkCount = Math.max(1, chunks.length);

  await setDoc(doc(db, SLIPS_COL, slipId), {
    id: slipId,
    bookingId: params.bookingId,
    customerPhone: params.customerPhone,
    customerName: params.customerName,
    amount: Number(params.amount) || 0,
    bankAccountUsed: params.bankAccountUsed || "",
    fileName: params.fileName,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
    chunkCount,
    dataUrl: chunkCount === 1 ? chunks[0] || "" : "",
    status: "pending_review",
    uploadedAt: now,
    updatedAt: now,
  });

  if (chunkCount > 1) {
    await Promise.all(
      chunks.map((chunkStr, idx) =>
        setDoc(
          doc(db, SLIPS_COL, slipId, "chunks", String(idx).padStart(4, "0")),
          {
            index: idx,
            chunk: chunkStr,
          }
        )
      )
    );
  }

  // A slip must not pull a trip that is scheduled, running or finished back to an
  // earlier stage, or overwrite how an earlier advance was received
  const current = (await getDoc(doc(db, "bookings", params.bookingId))).data() || {};
  const awaitingPayment = ["", "pending", "awaiting_payment", "payment_submitted"].includes(
    String(current.status || "")
  );
  const isBalanceSlip = Number(current.advanceAmount) > 0 && Number(current.pendingAmount) > 0;
  const method = isBalanceSlip
    ? { finalPaymentMethod: "bank_slip", finalPaymentBankUsed: params.bankAccountUsed || "" }
    : { paymentMethod: "bank_slip", paymentBankUsed: params.bankAccountUsed || "" };

  const bookingPatch = {
    ...(awaitingPayment ? { status: "payment_submitted" } : {}),
    ...method,
    paymentSlipId: slipId,
    paymentSlipName: params.fileName,
    paymentSlipType: params.mimeType,
    paymentSlipSize: params.fileSize,
    paymentSlipUploadedAt: now,
    paymentSlipStatus: "pending_review",
    paymentRejectReason: "",
    paymentSlipDeletedAt: 0,
    updatedAt: now,
  };

  await setDoc(doc(db, "bookings", params.bookingId), bookingPatch, { merge: true });

  // Also sync any legacy doc referencing trackingId
  try {
    const legacySnap = await getDocs(
      query(collection(db, "bookings"), where("trackingId", "==", params.bookingId))
    );
    await Promise.all(
      legacySnap.docs
        .filter((d) => d.id !== params.bookingId)
        .map((d) => updateDoc(doc(db, "bookings", d.id), bookingPatch))
    );
  } catch {
    // non-blocking
  }

  return { slipId, uploadedAt: now };
}

/**
 * Fetch and reassemble a full PDF or Image payment slip from Cloud Firestore DB.
 */
export async function fetchPaymentSlipFromDb(
  slipId: string
): Promise<PaymentSlipRecord | null> {
  if (!slipId) return null;
  const snap = await getDoc(doc(db, SLIPS_COL, slipId));
  if (!snap.exists()) return null;

  const data = snap.data();
  const chunkCount = Number(data.chunkCount) || 1;
  let dataUrl = String(data.dataUrl || "");

  if (chunkCount > 1 || !dataUrl) {
    const chunksSnap = await getDocs(collection(db, SLIPS_COL, slipId, "chunks"));
    const ordered = chunksSnap.docs
      .map((c) => c.data())
      .sort((a, b) => Number(a.index) - Number(b.index));
    dataUrl = ordered.map((c) => String(c.chunk || "")).join("");
  }

  return {
    id: slipId,
    bookingId: String(data.bookingId || ""),
    customerPhone: String(data.customerPhone || ""),
    customerName: String(data.customerName || "Customer"),
    amount: Number(data.amount) || 0,
    bankAccountUsed: String(data.bankAccountUsed || ""),
    fileName: String(data.fileName || "payment-slip"),
    mimeType: String(data.mimeType || "application/pdf"),
    fileSize: Number(data.fileSize) || 0,
    chunkCount,
    dataUrl,
    status: (data.status as PaymentSlipRecord["status"]) || "pending_review",
    uploadedAt: Number(data.uploadedAt) || 0,
    updatedAt: Number(data.updatedAt) || 0,
  };
}

/**
 * Subscribe to metadata list of all stored Payment Slips in Firestore (excludes heavy payloads).
 */
export function subscribePaymentSlipMetadataList(
  callback: (slips: Omit<PaymentSlipRecord, "dataUrl">[]) => void
): () => void {
  let active = true;
  const unsub = onSnapshot(
    collection(db, SLIPS_COL),
    (snap) => {
      if (!active) return;
      const list: Omit<PaymentSlipRecord, "dataUrl">[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            bookingId: String(data.bookingId || ""),
            customerPhone: String(data.customerPhone || ""),
            customerName: String(data.customerName || "Customer"),
            amount: Number(data.amount) || 0,
            bankAccountUsed: String(data.bankAccountUsed || ""),
            fileName: String(data.fileName || "payment-slip"),
            mimeType: String(data.mimeType || "application/pdf"),
            fileSize: Number(data.fileSize) || 0,
            chunkCount: Number(data.chunkCount) || 1,
            status: (data.status as PaymentSlipRecord["status"]) || "pending_review",
            uploadedAt: Number(data.uploadedAt) || 0,
            updatedAt: Number(data.updatedAt) || 0,
          };
        })
        .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      callback(list);
    },
    () => {
      if (active) callback([]);
    }
  );
  return () => {
    active = false;
    unsub();
  };
}

/**
 * Delete a Payment Slip (and its chunk subcollection) cleanly from Cloud Firestore DB
 * after Admin review, without touching booking approval or amount history.
 */
export async function deletePaymentSlipFromDb(
  bookingId: string,
  slipId?: string
): Promise<void> {
  const now = Date.now();
  if (slipId) {
    await deleteSlipDocAndChunks(slipId);
  }
  if (bookingId) {
    try {
      const related = await getDocs(
        query(collection(db, SLIPS_COL), where("bookingId", "==", bookingId))
      );
      await Promise.all(related.docs.map((d) => deleteSlipDocAndChunks(d.id)));
    } catch {
      // non-blocking
    }

    const bookingClearPatch = {
      paymentSlipId: "",
      paymentSlipName: "",
      paymentSlipType: "",
      paymentSlipSize: 0,
      paymentSlipStatus: "deleted",
      paymentSlipDeletedAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, "bookings", bookingId), bookingClearPatch, { merge: true });
      const legacySnap = await getDocs(
        query(collection(db, "bookings"), where("trackingId", "==", bookingId))
      );
      await Promise.all(
        legacySnap.docs
          .filter((d) => d.id !== bookingId)
          .map((d) => updateDoc(doc(db, "bookings", d.id), bookingClearPatch))
      );
    } catch {
      // non-blocking if booking already deleted
    }
  }
}

/**
 * Convert a Base64 Data URL into an Object Blob URL suitable for embedding PDFs reliably
 * inside an <iframe> or opening in a new browser tab.
 */
export function dataUrlToBlobUrl(dataUrl: string, fallbackMime = "application/pdf"): string {
  if (!dataUrl || !dataUrl.includes(",")) return dataUrl;
  try {
    const [header, base64] = dataUrl.split(",", 2);
    const mimeMatch = header.match(/data:([^;]+);/i);
    const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return dataUrl;
  }
}

