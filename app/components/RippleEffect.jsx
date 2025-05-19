'use client';

import React, { useEffect, useRef, useState } from 'react';

const RippleEffect = ({ imageUrl, fullscreen = false, onIdleTimeReached = null, idleTimeThreshold = 30000 }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [userInteracted, setUserInteracted] = useState(false);
  const animationFrameRef = useRef(null);
  const lastInteractionTimeRef = useRef(Date.now());
  const [uploadedImage, setUploadedImage] = useState(imageUrl || "/hero-background.jpg");
  
  // 画像アップロード処理
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.match('image.*')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result);
        setImageLoaded(false);
      };
      reader.readAsDataURL(file);
    }
  };
  
  // 放置検出
  useEffect(() => {
    if (!onIdleTimeReached) return;
    
    let idleTimer;
    
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        onIdleTimeReached();
      }, idleTimeThreshold);
    };
    
    // 初期タイマー設定
    resetIdleTimer();
    
    // ユーザーの操作を検出するイベントリスナー
    const userActivityHandler = () => resetIdleTimer();
    
    // 様々なイベントでタイマーをリセット
    window.addEventListener('mousemove', userActivityHandler);
    window.addEventListener('keydown', userActivityHandler);
    window.addEventListener('scroll', userActivityHandler);
    window.addEventListener('touchstart', userActivityHandler);
    
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('mousemove', userActivityHandler);
      window.removeEventListener('keydown', userActivityHandler);
      window.removeEventListener('scroll', userActivityHandler);
      window.removeEventListener('touchstart', userActivityHandler);
    };
  }, [onIdleTimeReached, idleTimeThreshold]);
  
  // コンポーネントがマウントされた時とリサイズ時にキャンバスサイズを更新
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && imageLoaded) {
        const containerRect = containerRef.current.getBoundingClientRect();
        
        // キャンバスが存在する場合、サイズを更新
        if (canvasRef.current) {
          canvasRef.current.width = containerRect.width;
          // アスペクト比を維持
          const aspectRatio = imageRef.current.naturalHeight / imageRef.current.naturalWidth;
          canvasRef.current.height = containerRect.width * aspectRatio;
        }
      }
    };

    // リサイズイベントのリスナーを登録
    window.addEventListener('resize', handleResize);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [imageLoaded]);
  
  // 波紋エフェクトの実装
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current) return;
    
    // キャンバスとコンテキストの設定
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const image = imageRef.current;
    
    // コンテナのサイズに合わせてキャンバスサイズを設定
    const containerRect = container.getBoundingClientRect();
    canvas.width = containerRect.width;
    
    // アスペクト比を維持
    const aspectRatio = image.naturalHeight / image.naturalWidth;
    canvas.height = containerRect.width * aspectRatio;
    
    // WebGLコンテキストを取得
    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGLをサポートしていないブラウザです");
      return;
    }
    
    // 頂点シェーダー
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
    
    // フラグメントシェーダー（波紋効果）
    const fsSource = `
      precision mediump float;
      
      uniform sampler2D u_image;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform bool u_userInteracted;
      
      varying vec2 v_texCoord;
      
      // 疑似乱数生成関数
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      
      void main() {
        vec2 uv = v_texCoord;
        vec2 mouse;
        
        // ユーザーが操作していない場合、時間に基づいてランダムな波紋位置を生成
        if (!u_userInteracted) {
          // 時間に応じて動くランダムな波紋の中心位置
          float t = u_time * 0.2;
          mouse.x = 0.5 + 0.4 * sin(t * 0.7);
          mouse.y = 0.5 + 0.4 * cos(t * 0.5);
        } else {
          // マウス位置（正規化）
          mouse = u_mouse / u_resolution;
        }
        
        // 波紋の中心からの距離
        float dist = distance(uv, mouse);
        
        // 時間によって変化する波紋効果
        float strength = 0.015;  // 波紋の強さ - 少し弱めに
        float frequency = 10.0;  // 波紋の周波数
        float speed = 1.2;      // 波紋の速さ
        
        // 波紋の計算
        float wave = strength * sin(dist * frequency - u_time * speed);
        wave *= smoothstep(0.6, 0.0, dist); // 距離が遠くなるにつれて効果を減衰（範囲を広げる）
        
        // テクスチャ座標のオフセット
        vec2 offset = normalize(uv - mouse) * wave;
        
        // 最終的なテクスチャ座標
        vec2 texCoord = uv + offset;
        
        // 画像のサンプリング
        gl_FragColor = texture2D(u_image, texCoord);
      }
    `;
    
    // シェーダーのコンパイル関数
    const compileShader = (gl, type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('シェーダーのコンパイルエラー: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      
      return shader;
    };
    
    // シェーダーのリンク
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('シェーダープログラムのリンクエラー: ' + gl.getProgramInfoLog(program));
      return;
    }
    
    gl.useProgram(program);
    
    // 位置座標の設定
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
    // 画面全体を覆う四角形の座標
    const positions = [
      -1.0, -1.0,  // 左下
       1.0, -1.0,  // 右下
      -1.0,  1.0,  // 左上
       1.0,  1.0,  // 右上
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    // テクスチャ座標の設定
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    
    const texCoords = [
      0.0, 1.0,  // 左下
      1.0, 1.0,  // 右下
      0.0, 0.0,  // 左上
      1.0, 0.0,  // 右上
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    
    const texCoordAttributeLocation = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordAttributeLocation);
    gl.vertexAttribPointer(texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    // 画像をテクスチャとして設定
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // テクスチャパラメータの設定
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // 画像をテクスチャにアップロード
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    // ユニフォーム変数の設定
    const timeUniformLocation = gl.getUniformLocation(program, "u_time");
    const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
    const mouseUniformLocation = gl.getUniformLocation(program, "u_mouse");
    const userInteractedLocation = gl.getUniformLocation(program, "u_userInteracted");
    
    // マウス座標の初期値（中央）
    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;
    
    // マウス移動イベントのハンドラ
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = rect.height - (e.clientY - rect.top); // WebGLは左下原点なので反転
      setUserInteracted(true);
      lastInteractionTimeRef.current = Date.now();
    };
    
    // タッチイベントのハンドラ
    const handleTouchMove = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      mouseX = e.touches[0].clientX - rect.left;
      mouseY = rect.height - (e.touches[0].clientY - rect.top);
      setUserInteracted(true);
      lastInteractionTimeRef.current = Date.now();
    };
    
    // 操作終了後、一定時間経過したらランダム波紋モードに戻る
    const inactivityTimeout = 3000; // 3秒間操作がなければランダムモードに戻る
    
    // イベントリスナーの登録
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // アニメーションループ
    let startTime = Date.now();
    
    const render = () => {
      // 経過時間（秒）
      const currentTime = (Date.now() - startTime) / 1000;
      
      // ユーザー操作がない状態が一定時間続いたらフラグをリセット
      if (userInteracted && Date.now() - lastInteractionTimeRef.current > inactivityTimeout) {
        setUserInteracted(false);
      }
      
      // ビューポートの設定
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // ユニフォーム変数の更新
      gl.uniform1f(timeUniformLocation, currentTime);
      gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
      gl.uniform2f(mouseUniformLocation, mouseX, mouseY);
      gl.uniform1i(userInteractedLocation, userInteracted ? 1 : 0);
      
      // 描画
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      // 次のフレームをリクエスト
      animationFrameRef.current = requestAnimationFrame(render);
    };
    
    // レンダリング開始
    render();
    
    // クリーンアップ関数
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texCoordBuffer);
      gl.deleteTexture(texture);
    };
  }, [imageLoaded, dimensions, userInteracted]);
  
  // 画像が読み込まれたときのハンドラ
  const handleImageLoad = () => {
    if (imageRef.current) {
      setDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
      setImageLoaded(true);
    }
  };
  
  return (
    <div className={`flex flex-col items-center ${fullscreen ? 'w-full h-screen' : 'w-full'}`}>
      {/* 画像アップロード機能（プレビュー用） */}
      <div className="my-4">
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleImageUpload} 
          className="p-2 border rounded"
        />
        <p className="text-sm text-gray-500 mt-1">画像をアップロードして波紋効果を適用</p>
      </div>
      
      <div 
        ref={containerRef} 
        className={`relative w-full max-w-4xl ${fullscreen ? 'h-full' : ''}`}
        style={fullscreen ? { overflow: 'hidden' } : {}}
      >
        {/* 非表示の元画像（テクスチャソース） */}
        <img
          ref={imageRef}
          src={uploadedImage}
          onLoad={handleImageLoad}
          alt="元画像"
          className="hidden"
        />
        
        {/* 波紋効果を表示するキャンバス */}
        {imageLoaded ? (
          <canvas
            ref={canvasRef}
            className={`w-full ${fullscreen ? 'h-full object-cover' : 'h-auto'}`}
            style={{ display: 'block' }}
          />
        ) : (
          <div className="flex items-center justify-center p-8 w-full">
            <p>画像を読み込み中...</p>
          </div>
        )}
      </div>
      
      <div className="mt-4 text-center">
        <p>画像の上でマウスを動かすと波紋が発生します</p>
        <p className="text-sm text-gray-500">操作しない場合、自動的にランダムな位置に波紋が表示されます</p>
      </div>
    </div>
  );
};

export default RippleEffect;