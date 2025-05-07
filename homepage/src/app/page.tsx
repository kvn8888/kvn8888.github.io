import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-5xl font-bold text-center mt-10">Welcome to <span className="text-blue-500 animated-highlight">KevinC.dev</span></h1>
      <div className="flex flex-col items-center">
        <a href="https://kevinc.dev/PasswordEntropyChecker" className="text-black text-2xl">
          Password Entropy Checker
          <span className="material-symbols-outlined relative top-1 text-black">arrow_outward</span>
        </a>
      </div>
    </div>
  );
}
