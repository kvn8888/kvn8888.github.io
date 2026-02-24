export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      {/* Aurora Background */}
      <div className="aurora-bg">
        <div className="aurora-blob aurora-blob-1"></div>
        <div className="aurora-blob aurora-blob-2"></div>
        <div className="aurora-blob aurora-blob-3"></div>
      </div>

      {/* Content */}
      <div className="text-center max-w-4xl mx-auto relative z-10">
        {/* Small tagline */}
        <p className="text-sm text-gray-500 mb-4 tracking-wide">
          Software Engineer & Builder
        </p>

        {/* Main headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight mb-8 text-black">
          Welcome to KevinC.dev
        </h1>

        {/* Bio text */}
        <p className="text-lg text-gray-600 max-w-xl mx-auto mb-8 leading-relaxed">
          I&apos;m a software engineering student at the Rochester Institute of Technology.
          Currently on an internship at Ivalua, Inc.
        </p>

        {/* CTA Button */}
        <a
          href="#projects"
          className="inline-flex items-center justify-center px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors shadow-lg hover:shadow-xl"
        >
          See my projects
        </a>

        {/* Projects Section */}
        <div id="projects" className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl mx-auto items-start">
          {/* Project Card 1 */}
          <div className="group relative">
            <div className="p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 transition-all duration-500 ease-out group-hover:bg-white/90 group-hover:scale-105 group-hover:-translate-y-2 group-hover:z-10 cursor-pointer overflow-hidden">
              {/* Header - always visible */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">Password Entropy Checker</span>
                <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
              </div>
              <p className="text-sm text-gray-500">Security tool for analyzing password strength</p>

              {/* Expanded content - appears on hover */}
              <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-500 ease-out">
                <div className="overflow-hidden">
                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">React</span>
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">TypeScript</span>
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">Cryptography</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      A web application that calculates password entropy and provides real-time feedback on password strength using Shannon entropy calculations.
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <a href="#" className="text-blue-600 hover:underline">View Demo →</a>
                      <a href="#" className="text-gray-500 hover:text-gray-900">GitHub</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Card 2 */}
          <div className="group relative">
            <div className="p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 transition-all duration-500 ease-out group-hover:bg-white/90 group-hover:scale-105 group-hover:-translate-y-2 group-hover:z-10 cursor-pointer overflow-hidden">
              {/* Header - always visible */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">Google TTS UI</span>
                <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
              </div>
              <p className="text-sm text-gray-500">Text-to-speech interface with voice selection</p>

              {/* Expanded content - appears on hover */}
              <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-500 ease-out">
                <div className="overflow-hidden">
                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">Next.js</span>
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">API</span>
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">Audio</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      A polished UI for Google Cloud Text-to-Speech API with voice preview, speed control, and batch processing capabilities.
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <a href="#" className="text-blue-600 hover:underline">View Demo →</a>
                      <a href="#" className="text-gray-500 hover:text-gray-900">GitHub</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Card 3 */}
          <div className="group relative">
            <div className="p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 transition-all duration-500 ease-out group-hover:bg-white/90 group-hover:scale-105 group-hover:-translate-y-2 group-hover:z-10 cursor-pointer overflow-hidden">
              {/* Header - always visible */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">Receipt Automator</span>
                <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
              </div>
              <p className="text-sm text-gray-500">Automated receipt processing with OCR</p>

              {/* Expanded content - appears on hover */}
              <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-500 ease-out">
                <div className="overflow-hidden">
                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">Python</span>
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">OCR</span>
                      <span className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">Automation</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      An intelligent system that extracts data from receipt images using OCR and automatically populates expense tracking spreadsheets.
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <a href="#" className="text-blue-600 hover:underline">View Demo →</a>
                      <a href="#" className="text-gray-500 hover:text-gray-900">GitHub</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
