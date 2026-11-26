"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function SlipReviewModal({ admin }: { admin: Admin }) {
  const {
    actionLoading,
    bookings,
    closeReviewModal,
    handleApproveSlipPayment,
    handleDeleteSlipFromDb,
    handleRejectSlipRequestReupload,
    reviewModal,
    setReviewModal,
  } = admin;

  return (
    <>
      {reviewModal && (() => {
        const linkedBooking =
          reviewModal.booking ||
          (reviewModal.slip
            ? bookings.find((bk) => bk.id === reviewModal.slip?.bookingId)
            : reviewModal.slipMeta
              ? bookings.find((bk) => bk.id === reviewModal.slipMeta?.bookingId)
              : undefined);
        const slipFile = reviewModal.slip;
        const isPdf = slipFile
          ? slipFile.mimeType === "application/pdf" ||
          slipFile.fileName.toLowerCase().endsWith(".pdf")
          : false;
        const targetBookingId =
          linkedBooking?.id || slipFile?.bookingId || reviewModal.slipMeta?.bookingId || "";
        const targetSlipId = slipFile?.id || reviewModal.slipMeta?.id || "";
        return (
          <div
            className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs overflow-y-auto"
            onClick={closeReviewModal}
          >
            <div
              className="w-full max-w-3xl max-h-[92vh] bg-white rounded-xl p-5 sm:p-6 shadow-2xl border border-[#E5E7EB] flex flex-col gap-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] pb-3">
                <div>
                  <h2 className="text-base font-semibold text-[#111827]">
                    Review Customer Payment Slip
                  </h2>
                  <div className="text-xs text-[#4B5563] mt-0.5 flex flex-wrap items-center gap-3">
                    <span>Booking: <b className="font-mono text-[#111827]">{targetBookingId || "N/A"}</b></span>
                    {(linkedBooking?.customerName || slipFile?.customerName || reviewModal.slipMeta?.customerName) && (
                      <span>
                        Customer: <b>{linkedBooking?.customerName || slipFile?.customerName || reviewModal.slipMeta?.customerName}</b>
                      </span>
                    )}
                    {(linkedBooking?.quotedAmount || slipFile?.amount || reviewModal.slipMeta?.amount) ? (
                      <span className="font-mono font-semibold text-amber-900">
                        Quoted: Rs. {(linkedBooking?.quotedAmount || slipFile?.amount || reviewModal.slipMeta?.amount || 0).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeReviewModal}
                  className="text-[#4B5563] hover:text-[#111827] font-bold text-base p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              {/* Metadata Strip */}
              {(slipFile || reviewModal.slipMeta) && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#111827] text-[#FFC20E] text-xs font-mono font-semibold">
                      {isPdf ? "PDF DOCUMENT" : "IMAGE SLIP"}
                    </span>
                    <b className="text-[#111827]">{slipFile?.fileName || reviewModal.slipMeta?.fileName}</b>
                    {(slipFile?.bankAccountUsed || reviewModal.slipMeta?.bankAccountUsed) && (
                      <span className="text-[#4B5563]">
                        • Bank: <b>{slipFile?.bankAccountUsed || reviewModal.slipMeta?.bankAccountUsed}</b>
                      </span>
                    )}
                  </div>
                  {reviewModal.blobUrl && (
                    <div className="flex items-center gap-2">
                      <a
                        href={reviewModal.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#FFC20E] text-xs font-bold text-[#111827]"
                      >
                        Open in New Tab
                      </a>
                      <a
                        href={reviewModal.blobUrl}
                        download={slipFile?.fileName || "payment-slip"}
                        className="px-2.5 py-1 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#FFC20E] text-xs font-bold text-[#111827]"
                      >
                        Download
                      </a>
                    </div>
                  )}
                </div>
              )}
              {/* Preview Pane */}
              <div className="w-full min-h-[280px] rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-2 flex items-center justify-center">
                {reviewModal.loading ? (
                  <p className="text-xs font-bold text-[#4B5563]">
                    Reassembling payment slip from Cloud Firestore database...
                  </p>
                ) : reviewModal.error ? (
                  <p className="text-xs font-bold text-red-600 p-6 text-center">{reviewModal.error}</p>
                ) : !reviewModal.blobUrl ? (
                  <p className="text-xs font-bold text-[#4B5563]">No preview available.</p>
                ) : isPdf ? (
                  <iframe
                    src={reviewModal.blobUrl}
                    title="Payment Slip PDF Preview"
                    className="w-full h-[380px] sm:h-[460px] rounded-xl border border-[#E5E7EB] bg-white"
                  />
                ) : (
                  <img
                    src={reviewModal.blobUrl}
                    alt={slipFile?.fileName || "Payment slip preview"}
                    className="max-h-[440px] w-auto max-w-full rounded-xl object-contain bg-white"
                  />
                )}
              </div>
              {/* Review Action Controls */}
              {linkedBooking && linkedBooking.status === "payment_submitted" && (
                <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                  <label className="block text-xs font-bold text-[#111827]">
                    Re-upload / Rejection Note (if slip is unclear or wrong amount)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={reviewModal.rejectReason}
                      onChange={(e) =>
                        setReviewModal((prev) =>
                          prev ? { ...prev, rejectReason: e.target.value } : null
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs text-[#111827]"
                    />
                    <button
                      type="button"
                      disabled={actionLoading === linkedBooking.id}
                      onClick={() =>
                        handleRejectSlipRequestReupload(linkedBooking, reviewModal.rejectReason)
                      }
                      className="px-4 py-2 rounded-xl border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Request Re-upload
                    </button>
                  </div>
                </div>
              )}
              {/* Footer Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
                {targetSlipId ? (
                  <button
                    type="button"
                    disabled={actionLoading === targetBookingId || actionLoading === targetSlipId}
                    onClick={() => {
                      if (confirm("Delete this payment slip permanently from Firestore database?")) {
                        handleDeleteSlipFromDb(targetBookingId, targetSlipId);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Delete Slip from DB
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={closeReviewModal}
                    className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                  {linkedBooking && linkedBooking.status === "payment_submitted" && (
                    <button
                      type="button"
                      disabled={actionLoading === linkedBooking.id}
                      onClick={() => handleApproveSlipPayment(linkedBooking)}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Approve Payment &amp; Schedule
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
