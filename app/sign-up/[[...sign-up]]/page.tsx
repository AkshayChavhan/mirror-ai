import { SignUp } from "@clerk/nextjs";

// Catch-all route: Clerk uses sub-paths like /sign-up/verify-email-address for multi-step sign-up.
export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <SignUp />
    </main>
  );
}
