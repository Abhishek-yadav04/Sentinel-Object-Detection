import Head from "next/head";
import Yolo from "../components/models/Yolo";
import dynamic from "next/dynamic";

export default function Home() {
  return (
    <>
      <Head>
        <title>Real-Time Object Detection</title>
        <meta name="description" content="Live object detection in the browser with ONNX Runtime Web" />
      </Head>
      <main className="min-h-screen w-full flex flex-col items-center justify-start">
        <header className="w-full max-w-6xl px-5 pt-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Real-Time Object Detection</h1>
              <p className="text-sm text-neutral-300 mt-1">Runs in your browser via ONNX Runtime Web. Zones, tripwires, webhooks.</p>
            </div>
            <a href="https://github.com/Abhishek-yadav04" className="text-xs text-neutral-300 hover:text-white underline underline-offset-2" title="Creator profile">
              Created by @Abhishek Yadav
            </a>
          </div>
        </header>
        <section className="w-full max-w-6xl px-5 py-6 relative">
          <div className="pointer-events-none absolute -inset-x-10 -top-24 h-56 bg-gradient-to-br from-indigo-600/20 via-fuchsia-600/10 to-transparent blur-3xl -z-10" />
          <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/30 backdrop-blur-sm shadow-2xl p-3 transition-shadow duration-300">
            <Yolo />
          </div>
        </section>
        <footer className="w-full max-w-6xl px-5 pb-10 text-sm text-neutral-400 text-center">
          <div className="opacity-70">© {new Date().getFullYear()} Abhishek Yadav · All rights reserved.</div>
        </footer>
      </main>
    </>
  );
}
