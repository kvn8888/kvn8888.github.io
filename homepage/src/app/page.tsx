import Image from "next/image";

export default function Home() {
  return (
    <div className="pt-24">
      <h1 className="text-4xl font-bold text-center" style={{ fontFamily: 'var(--font-noto-serif)' }}>Welcome to <span className="text-[#D97757]">KevinC.dev</span></h1>
      <p className="mt-6 text-center text-lg text-gray-700 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-geist-sans)' }}>I'm a software engineering student at the Rochester Institute of Technology. I'm currently on an internship at Ivalua, Inc. Here are some of my projects:</p>
    </div>
  );
}
