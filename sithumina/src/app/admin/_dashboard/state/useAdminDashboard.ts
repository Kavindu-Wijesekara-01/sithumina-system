"use client";

import { useStage1 } from "./useBookingState";
import { useStage2 } from "./useBookingActions";
import { useStage3 } from "./useDashboardData";
import { createRenderBookingDispatchCard } from "../bookings/renderBookingDispatchCard";

export function useAdminDashboard() {
  const stage1 = useStage1();
  const stage2 = useStage2(stage1);
  const stage3 = useStage3(stage2);
  return {
    ...stage3,
    renderBookingDispatchCard: createRenderBookingDispatchCard(stage3),
  };
}

export type Admin = ReturnType<typeof useAdminDashboard>;
