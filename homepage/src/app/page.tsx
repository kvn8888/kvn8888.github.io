export default function Home() {
  return (
    <div className="pt-24">
      <h1 className="text-4xl font-bold text-center" style={{ fontFamily: 'var(--font-noto-serif)' }}>Welcome to <span className="text-[#D97757]">KevinC.dev</span></h1>
      <p className="mt-6 text-center text-lg text-gray-700 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-geist-sans)' }}>I&apos;m a software engineering student at the Rochester Institute of Technology. I&apos;m currently on an internship at Ivalua, Inc. Here are some of my projects:</p>
      
      <div className="mt-10 flex flex-col items-center gap-4">
        <a href="#" className="w-80 px-8 py-3 border-2 border-[#D97757] text-[black] font-medium hover:bg-[#D97757] hover:text-white transition-colors text-center">
          Project One <span className="material-symbols-outlined align-middle text-base">arrow_outward</span>
        </a>
        <a href="#" className="w-80 px-8 py-3 border-2 border-[#D97757] text-[black] font-medium hover:bg-[#D97757] hover:text-white transition-colors text-center">
          Project Two <span className="material-symbols-outlined align-middle text-base">arrow_outward</span>
        </a>
        <a href="#" className="w-80 px-8 py-3 border-2 border-[#D97757] text-[black] font-medium hover:bg-[#D97757] hover:text-white transition-colors text-center">
          Project Three <span className="material-symbols-outlined align-middle text-base">arrow_outward</span>
        </a>
      </div>
    </div>
  );
}
