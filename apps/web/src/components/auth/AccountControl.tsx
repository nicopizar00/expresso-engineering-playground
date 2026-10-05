"use client";

import { useState } from "react";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { SignInDialog } from "./SignInDialog";

export function AccountControl() {
  const { user, isLoading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (isLoading) return null;

  if (!user) {
    return (
      <>
        <button
          type="button"
          data-testid="account-signin"
          onClick={() => setOpen(true)}
          aria-label="Sign in"
          className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1.5 rounded-md text-xs font-medium tone-muted"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign in</span>
        </button>
        <SignInDialog open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium tone-secondary"
        title={user.email}
      >
        <UserRound className="h-3.5 w-3.5" />
        <span data-testid="account-chip" className="max-w-[6rem] truncate">
          {user.username}
        </span>
      </span>
      <button
        type="button"
        data-testid="account-signout"
        onClick={() => void logout()}
        aria-label="Sign out"
        className="flex items-center justify-center w-8 h-8 rounded-md tone-muted"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
