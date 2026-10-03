import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

import { HandTier } from '../lib/dice';

const CLACKS = [
  require('../../assets/sounds/clack1.wav'),
  require('../../assets/sounds/clack2.wav'),
  require('../../assets/sounds/clack3.wav'),
  require('../../assets/sounds/clack4.wav'),
];

/** 役が出たときの太鼓：最上級は 2 回「ドン、ドーン」、小当たりは 1 回「ドン」 */
const RESULT_SOUNDS = {
  jackpot: require('../../assets/sounds/taiko-double.wav'),
  win: require('../../assets/sounds/taiko-single.wav'),
};

/** 重なって鳴らせるよう、プレイヤーを複数用意して順番に使う */
const POOL_SIZE = 8;

export function useDiceSound() {
  const pool = useRef<AudioPlayer[]>([]);
  const next = useRef(0);
  const results = useRef<Partial<Record<keyof typeof RESULT_SOUNDS, AudioPlayer>>>({});

  useEffect(() => {
    // 消音スイッチ ON のときは鳴らさない。他アプリの音楽は止めない。
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    const players = Array.from({ length: POOL_SIZE }, (_, i) => createAudioPlayer(CLACKS[i % CLACKS.length]));
    pool.current = players;
    const resultPlayers = {
      jackpot: createAudioPlayer(RESULT_SOUNDS.jackpot),
      win: createAudioPlayer(RESULT_SOUNDS.win),
    };
    results.current = resultPlayers;
    return () => {
      pool.current = [];
      results.current = {};
      players.forEach((p) => p.remove());
      Object.values(resultPlayers).forEach((p) => p.remove());
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

  /** 役が出たときの効果音。最上級・小当たりは太鼓、それ以外（ヒフミ・目なし）は鳴らさない */
  const playResult = useCallback((tier: HandTier) => {
    if (tier !== 'jackpot' && tier !== 'win') return;
    const player = results.current[tier];
    if (!player) return;
    player.volume = 1;
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => {});
  }, []);

  return { playClack, playResult };
}
