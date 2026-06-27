import React, { useState, useEffect, useRef } from 'react';

/* =================================================================
   JLPT Master — Handwriting input for Kanji search
   Draw a character with finger (phone) or mouse, get candidate
   kanji via Google Input Tools handwriting recognition (free, no
   API key), then tap a candidate to insert it into the search box.
   ================================================================= */

var RECOGNITION_URL = 'https://inputtools.google.com/request?itc=ja-t-i0-handwrit&app=jlptmaster';
var CANVAS_SIZE = 280;       // CSS pixels (square drawing area)
var INK_COLOR = '#1a1a1a';
var INK_WIDTH = 4;
var MAX_CANDIDATES = 8;

/**
 * Sends recorded strokes to the recognizer.
 * Strokes format: [ [ [x...], [y...], [t...] ], ... ]
 * Resolves to an array of candidate strings (may be empty).
 */
function recognizeStrokes(strokes) {
    return fetch(RECOGNITION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            options: 'enable_pre_space',
            requests: [{
                writing_guide: { writing_area_width: CANVAS_SIZE, writing_area_height: CANVAS_SIZE },
                pre_context: '',
                max_num_results: MAX_CANDIDATES,
                max_completions: 0,
                language: 'ja',
                ink: strokes
            }]
        })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data && data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
                return data[1][0][1].slice(0, MAX_CANDIDATES);
            }
            return [];
        });
}

function HandwritingInput(props) {
    var canvasRef = useRef(null);
    var strokesRef = useRef([]);        // committed strokes
    var currentStrokeRef = useRef(null); // stroke in progress
    var startTimeRef = useRef(0);
    var isDrawingRef = useRef(false);

    var _candidates = useState([]);
    var candidates = _candidates[0], setCandidates = _candidates[1];

    var _status = useState('idle'); // 'idle' | 'recognizing' | 'error'
    var status = _status[0], setStatus = _status[1];

    function getCtx() {
        var canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.getContext('2d');
    }

    function clearCanvas() {
        var canvas = canvasRef.current;
        var ctx = getCtx();
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function redrawStrokes() {
        var ctx = getCtx();
        if (!ctx) return;
        clearCanvas();
        ctx.strokeStyle = INK_COLOR;
        ctx.lineWidth = INK_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokesRef.current.forEach(function (s) {
            var xs = s[0], ys = s[1];
            if (xs.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(xs[0], ys[0]);
            for (var i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
            ctx.stroke();
        });
    }

    useEffect(function () {
        clearCanvas();
    }, []);

    function getPos(e) {
        var rect = canvasRef.current.getBoundingClientRect();
        return {
            x: Math.round(e.clientX - rect.left),
            y: Math.round(e.clientY - rect.top)
        };
    }

    function handlePointerDown(e) {
        e.preventDefault();
        if (canvasRef.current && e.pointerId !== undefined) {
            try { canvasRef.current.setPointerCapture(e.pointerId); } catch (err) {}
        }
        isDrawingRef.current = true;
        if (strokesRef.current.length === 0) startTimeRef.current = Date.now();
        var pos = getPos(e);
        currentStrokeRef.current = [[pos.x], [pos.y], [Date.now() - startTimeRef.current]];
        var ctx = getCtx();
        if (ctx) {
            ctx.strokeStyle = INK_COLOR;
            ctx.lineWidth = INK_WIDTH;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }
    }

    function handlePointerMove(e) {
        if (!isDrawingRef.current || !currentStrokeRef.current) return;
        e.preventDefault();
        var pos = getPos(e);
        var stroke = currentStrokeRef.current;
        stroke[0].push(pos.x);
        stroke[1].push(pos.y);
        stroke[2].push(Date.now() - startTimeRef.current);
        var ctx = getCtx();
        if (ctx) {
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }
    }

    function handlePointerUp(e) {
        if (!isDrawingRef.current) return;
        e.preventDefault();
        isDrawingRef.current = false;
        if (currentStrokeRef.current && currentStrokeRef.current[0].length > 0) {
            strokesRef.current.push(currentStrokeRef.current);
        }
        currentStrokeRef.current = null;
        runRecognition();
    }

    function runRecognition() {
        if (strokesRef.current.length === 0) {
            setCandidates([]);
            setStatus('idle');
            return;
        }
        setStatus('recognizing');
        recognizeStrokes(strokesRef.current)
            .then(function (results) {
                setCandidates(results);
                setStatus('idle');
            })
            .catch(function () {
                setCandidates([]);
                setStatus('error');
            });
    }

    function handleUndo() {
        strokesRef.current = strokesRef.current.slice(0, -1);
        redrawStrokes();
        runRecognition();
    }

    function handleClear() {
        strokesRef.current = [];
        currentStrokeRef.current = null;
        clearCanvas();
        setCandidates([]);
        setStatus('idle');
    }

    function handlePick(char) {
        if (props.onSelect) props.onSelect(char);
        handleClear();
    }

    var candidateEls = candidates.map(function (c, i) {
        return <button key={i} className='btn btn--outline' style={{
  fontSize: '1.4rem',
  padding: '6px 14px',
  fontFamily: 'var(--font-jp, sans-serif)',
  minWidth: '52px'
}} onClick={() => {
  handlePick(c);
}}>{c}</button>;
    });

    return <div style={{
  marginTop: '14px',
  padding: '16px',
  borderRadius: '14px',
  background: 'rgba(0,0,0,0.15)',
  border: '1px solid rgba(255,255,255,0.08)'
}}><div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  }}><strong style={{
      color: 'var(--text-secondary)'
    }}>✍️ Draw a character</strong><button className='btn btn--small btn--outline' onClick={props.onClose}>✕ Close</button></div><div style={{
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    alignItems: 'flex-start'
  }}> // Drawing canvas
    <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{
      width: CANVAS_SIZE + 'px',
      height: CANVAS_SIZE + 'px',
      maxWidth: '100%',
      borderRadius: '12px',
      border: '2px dashed #bbb',
      background: '#fff',
      touchAction: 'none',
      cursor: 'crosshair'
    }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} /> // Candidates + controls
    <div style={{
      flex: 1,
      minWidth: '180px'
    }}><div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '12px'
      }}><button className='btn btn--small btn--outline' onClick={handleUndo}>↩ Undo</button><button className='btn btn--small btn--outline' onClick={handleClear}>🗑 Clear</button></div>{status === 'recognizing' ? <div style={{
        color: 'var(--text-muted)',
        fontSize: '0.9rem',
        marginBottom: 8
      }}>Recognizing…</div> : null}{status === 'error' ? <div style={{
        color: 'var(--accent-red)',
        fontSize: '0.9rem',
        marginBottom: 8
      }}>Recognition failed — check your internet connection.</div> : null}{candidates.length > 0 ? <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap'
      }}>{candidateEls}</div> : status === 'idle' ? <div style={{
        color: 'var(--text-muted)',
        fontSize: '0.9rem'
      }}>Candidates appear here after each stroke. Tap one to add it to the search box.</div> : null}</div></div></div>;
}

export { HandwritingInput, recognizeStrokes };
