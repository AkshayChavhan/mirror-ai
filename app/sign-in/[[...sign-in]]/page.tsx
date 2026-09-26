import { SignIn } from "@clerk/nextjs";

// Catch-all route: Clerk uses sub-paths like /sign-in/factor-one for multi-step sign-in.
export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <SignIn />
    </main>
  );
}
