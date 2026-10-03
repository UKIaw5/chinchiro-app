import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

const CLACKS = [
  require('../../assets/sounds/clack1.wav'),
  require('../../assets/sounds/clack2.wav'),
  require('../../assets/sounds/clack3.wav'),
  require('../../assets/sounds/clack4.wav'),
];

/** 重なって鳴らせるよう、プレイヤーを複数用意して順番に使う */
const POOL_SIZE = 8;

export function useDiceSound() {
  const pool = useRef<AudioPlayer[]>([]);
  const next = useRef(0);

  useEffect(() => {
    // 消音スイッチ ON のときは鳴らさない。他アプリの音楽は止めない。
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    const players = Array.from({ length: POOL_SIZE }, (_, i) => createAudioPlayer(CLACKS[i % CLACKS.length]));
    pool.current = players;
    return () => {
      pool.current = [];
      players.forEach((p) => p.remove());
    };
  }, []);

  /** strength: 0〜1 */
  const playClack = useCallback((strength: number) => {
    const players = pool.current;
    if (players.length === 0) return;
    const player = players[next.current];
    next.current = (next.current + 1) % players.length;
    player.volume = 0.15 + 0.85 * strength;
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => {});
  }, []);

  return { playClack };
}
