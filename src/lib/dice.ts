export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export type Dice = [DieFace, DieFace, DieFace];

/** タップ位置の区分。center 以外は決まった役が出る。 */
export type Zone = 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export type HandKind = 'pinzoro' | 'arashi' | 'shigoro' | 'hifumi' | 'me' | 'menashi';

export type Hand = {
  kind: HandKind;
  label: string;
};

/** 四隅の判定領域（画面の幅・高さに対する割合） */
export const CORNER_RATIO = 0.2;

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function randomFace(): DieFace {
  return randomInt(1, 6) as DieFace;
}

/** Fisher–Yates シャッフル（新しい配列を返す） */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function randomDice(): Dice {
  return [randomFace(), randomFace(), randomFace()];
}

/** 区分に応じた出目を生成する。並び順は常にランダム。 */
export function rollForZone(zone: Zone): Dice {
  switch (zone) {
    case 'topLeft':
      return [1, 1, 1];
    case 'topRight':
      return shuffle([4, 5, 6] as Dice) as Dice;
    case 'bottomLeft': {
      const face = randomInt(2, 6) as DieFace;
      return [face, face, face];
    }
    case 'bottomRight': {
      const pair = randomFace();
      let single = randomFace();
      while (single === pair) single = randomFace();
      return shuffle([pair, pair, single] as Dice) as Dice;
    }
    case 'center':
      return randomDice();
  }
}

/** タップ座標から区分を判定する */
export function zoneAt(x: number, y: number, width: number, height: number): Zone {
  const left = x < width * CORNER_RATIO;
  const right = x > width * (1 - CORNER_RATIO);
  const top = y < height * CORNER_RATIO;
  const bottom = y > height * (1 - CORNER_RATIO);

  if (top && left) return 'topLeft';
  if (top && right) return 'topRight';
  if (bottom && left) return 'bottomLeft';
  if (bottom && right) return 'bottomRight';
  return 'center';
}

/** 出目から役を判定する */
export function evaluate(dice: Dice): Hand {
  const [a, b, c] = [...dice].sort((x, y) => x - y);

  if (a === b && b === c) {
    return a === 1 ? { kind: 'pinzoro', label: 'ピンゾロ' } : { kind: 'arashi', label: 'アラシ' };
  }
  if (a === 4 && b === 5 && c === 6) return { kind: 'shigoro', label: 'シゴロ' };
  if (a === 1 && b === 2 && c === 3) return { kind: 'hifumi', label: 'ヒフミ' };
  if (a === b) return { kind: 'me', label: `${c}の目` };
  if (b === c) return { kind: 'me', label: `${a}の目` };
  return { kind: 'menashi', label: '目なし' };
}
