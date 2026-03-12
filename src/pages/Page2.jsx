import React from 'react';
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Activity } from 'lucide-react';

const Page2 = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#2d2d2d] text-gray-300 font-mono selection:bg-yellow-500/30">

      {/* TOP BAR */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-[#3a3a3a] border-b border-gray-600 px-4 flex items-center justify-between z-50 shadow-md">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-yellow-500 hidden sm:block" />
          <span className="text-yellow-400 font-bold text-sm">Lightnings Simulator</span>
          <span className="text-[10px] text-gray-400 hidden sm:block">Bar Replay Simulator</span>
        </div>

        <div className="flex gap-2 sm:gap-4 text-xs items-center">
          <a href="#pricing" className="text-gray-400 hover:text-white hidden sm:block">Pricing</a>
          <a href="#about" className="text-gray-400 hover:text-white hidden sm:block">About</a>
          <button onClick={() => navigate("/")} className="mt-btn px-3 py-1 flex items-center gap-2 bg-blue-500/10 text-blue-400 border-blue-500/50 hover:bg-blue-500/20 font-bold">
            <ArrowLeft size={14} /> Back to Simulator
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="pt-24 px-4 pb-12 max-w-4xl mx-auto space-y-16">

        {/* PRICING */}
        <section id="pricing" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            Pricing Plans
          </h2>
          <div className="mt-panel p-6 sm:p-8 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

            <p className="text-2xl text-lime-400 font-black mb-1">Pro <span className="text-sm text-lime-400/70 font-normal">Version</span></p>
            <p className="text-sm text-gray-400 mb-6 max-w-md">
              Pricing may increase based on specific customization and feature complexity required for your trading setup.
            </p>

            <ul className="space-y-3 text-sm mb-6">
              <li className="flex gap-2"><span className="text-lime-500">✓</span> Fully customizable according to your needs</li>
              <li className="flex gap-2"><span className="text-lime-500">✓</span> One-time or monthly pricing based on features</li>
            </ul>

            <hr className="my-6 border-gray-600" />

            <p className="text-sm text-cyan-400 font-bold mb-4 uppercase tracking-wider">Premium Features Unlock</p>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Multiple charts on one screen (2×2, 4×4)</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Advanced Chart synchronization</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Seconds & TBT (tick-by-tick) timeframe</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Custom proprietary indicators</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Crypto, Forex, Indices & Metals data</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Skip datetime or start from random point</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Save & load replay progress</div>
              <div className="flex gap-2"><span className="text-yellow-500">★</span> Full statistical performance dashboard</div>
            </div>
          </div>
        </section>

        {/* ABOUT */}
        <section id="about" className="scroll-mt-24">
          <h2 className="text-xl font-bold text-white mb-4">About Me</h2>
          <div className="mt-panel p-6 space-y-4 text-sm leading-relaxed">
            <p>
              Hi, welcome to  <span className="text-yellow-400 font-bold text-base">Lightnings Trades</span> and I’m a software developer as well as a trader.
            </p>
            <p>
              I created this easy-to-use bar replay simulator to help traders practice and analyze markets without pressure. The goal is to provide a clean, fast, and distraction-free environment to hone your strategies.
            </p>
            <p>
              If you want any new feature added to your personal dashboard, I can build it for a minimum charge.
            </p>
            <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg text-blue-200 mt-4">
              <p>Even if you don’t want paid services — or didn’t like the website — your feedback is extremely valuable for future upgrades!</p>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="scroll-mt-24">
          <h2 className="text-xl font-bold text-white mb-4">Contact & Support</h2>
          <div className="mt-panel p-6 space-y-4 text-sm">
            <p>Feel free to contact me regarding:</p>
            <ul className="grid sm:grid-cols-2 gap-2 text-gray-400 ml-2">
              <li>• Feature requests</li>
              <li>• Bug reports</li>
              <li>• Customization</li>
              <li>• Feedback & experience sharing</li>
            </ul>

            <div className="flex flex-col gap-2 text-xs">
              <div className="text-gray-400 hover:text-white transition">
                <span className="font-medium">Email:</span> lightningtrades.support@gmail.com
              </div>

              <div className="text-gray-400 hover:text-white transition">
                <span className="font-medium">Instagram:</span> @lightningstrades
              </div>

              <div className="text-blue-400 hover:text-blue-300 transition">
                <span className="font-medium">Telegram:</span> https://t.me/lightningstrades
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4 italic">
              please follow me on socials for the latest links and updates.
            </p>
          </div>
        </section>

        {/* LEGAL */}
        <section id="legal">
          <h2 className="text-lg font-bold text-gray-400 mb-3">Legal Disclaimer</h2>
          <div className="mt-panel bg-[#222] p-5 text-xs text-gray-500 border-dashed border-gray-600">
            <p>
              This website utilizes TradingView Lightweight Charts™, which is an open-license and free-to-use charting library provided by TradingView.
              This project is built for learning, experimentation, and community feedback. Trading in financial markets involves high risk.
            </p>
          </div>
        </section>

      </div>

      {/* FOOTER */}
      <footer className="text-center text-xs text-gray-500 py-8 border-t border-gray-700 mt-10 bg-[#222]">
        <p className="mb-1">© 2026 LightningsTrades</p>
        <p className="opacity-50">Optimized for Desktop & Mobile</p>
      </footer>

    </div>
  );
};

export default Page2;