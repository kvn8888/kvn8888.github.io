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
        <div id="projects" className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl mx-auto">
          <a 
            href="#" 
            className="group p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 hover:bg-white/80 transition-all duration-300 hover:shadow-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Project One</span>
              <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
            </div>
            <p className="text-sm text-gray-500">A brief description of the first project</p>
          </a>

          <a 
            href="#" 
            className="group p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 hover:bg-white/80 transition-all duration-300 hover:shadow-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Project Two</span>
              <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
            </div>
            <p className="text-sm text-gray-500">A brief description of the second project</p>
          </a>

          <a 
            href="#" 
            className="group p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 hover:bg-white/80 transition-all duration-300 hover:shadow-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">Project Three</span>
              <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
            </div>
            <p className="text-sm text-gray-500">A brief description of the third project</p>
          </a>
        </div>
      </div>
    </div>
  );
}
