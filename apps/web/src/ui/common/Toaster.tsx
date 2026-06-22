"use client";

import { CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Toaster as SonnerToaster } from "sonner";

const ic = "h-4 w-4 shrink-0";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      duration={3000}
      closeButton
      icons={{
        success: <CheckCircle className={`${ic} text-green-600`} />,
        error:   <AlertCircle className={`${ic} text-red-500`} />,
        warning: <AlertTriangle className={`${ic} text-amber-600`} />,
        info:    <Info className={`${ic} text-[#30518c]`} />,
      }}
    />
  );
}
