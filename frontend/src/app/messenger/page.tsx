"use client";

import { AuthGuard } from "@/components/AuthGuard";
import Messenger from "@/components/Messenger";

export default function MessengerPage() {
  return (
    <AuthGuard>
      <Messenger />
    </AuthGuard>
  );
}
