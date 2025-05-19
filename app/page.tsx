import RippleEffect from './components/RippleEffect';

export default function Home() {
  return (
    <div className="min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">水面波紋エフェクトデモ</h1>
      <RippleEffect />
    </div>
  );
}