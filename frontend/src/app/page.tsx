"use client";

import { AuthGuard } from "@/components/AuthGuard";
import Messenger from "@/components/Messenger";

export default function Home() {
  return (
    <AuthGuard>
      <Messenger />
    </AuthGuard>
  );
}
