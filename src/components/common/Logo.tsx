/**
 * @file Logo - 应用品牌图
 * @description 内联完整版 Celery Todo 标志（兔子 + 卷轴），
 *              配色采用 Anthropic / Claude 风格：温暖珊瑚 + 纸质米白 + 暖灰描边。
 *              默认继承父级尺寸（width/height 100%），可用 props 固定尺寸。
 */

import { memo } from 'react';

interface LogoProps {
  /** 渲染尺寸（px），同时设置 width / height */
  size?: number;
  /** 额外类名 */
  className?: string;
  /** 题目（无障碍） */
  title?: string;
}

/**
 * 完整版 Logo：兔子 + 待办卷轴，与 /assets/logo.svg 保持一致。
 * 内联在 JSX 里以便随主题色（CSS 变量）联动。
 */
function LogoComponent({ size, className, title = 'Celery Todo' }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 800"
      width={size ?? '100%'}
      height={size ?? '100%'}
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* 兔子尾巴 / 后半部分（卷轴后方，深珊瑚衬托层次） */}
      <circle cx="540" cy="530" r="35" fill="#c75d3d" />

      {/* 兔子身体与头部 */}
      <path
        d="M 330 600
           C 330 550, 300 520, 290 480
           C 270 420, 220 400, 220 350
           C 220 310, 240 280, 290 270
           C 340 260, 370 290, 380 340
           C 390 400, 390 450, 420 500
           L 420 600 Z"
        fill="#d97757"
      />

      {/* 兔子嘴巴缺口与眼睛 */}
      <path d="M 225 340 L 235 345 L 220 355 Z" fill="#faf9f7" />
      <circle cx="280" cy="310" r="11" fill="#2f2d27" />

      {/* 兔子双耳（右耳用更深的珊瑚色衬托层次） */}
      <path
        d="M 320 280 C 330 180, 370 150, 380 160 C 390 170, 370 230, 340 290 Z"
        fill="#d97757"
      />
      <path
        d="M 350 290 C 380 220, 440 180, 450 200 C 460 220, 400 280, 370 310 Z"
        fill="#c75d3d"
      />

      {/* 卷轴轮廓：纸质白 + 暖灰描边 */}
      <path
        d="M 400 270
           Q 480 260 570 270
           Q 590 275 580 290
           Q 570 305 560 290
           Q 530 450 490 580
           Q 480 600 500 605
           Q 520 610 520 585
           L 320 600
           Q 360 420, 400 270 Z"
        fill="#ffffff"
        stroke="#5c584c"
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 卷轴内的横线（深珊瑚，呼应待办条目） */}
      <line
        x1="450"
        y1="320"
        x2="540"
        y2="320"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="420"
        y1="350"
        x2="530"
        y2="350"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="410"
        y1="380"
        x2="520"
        y2="380"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="400"
        y1="410"
        x2="510"
        y2="410"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="390"
        y1="440"
        x2="500"
        y2="440"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="380"
        y1="470"
        x2="490"
        y2="470"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="370"
        y1="500"
        x2="480"
        y2="500"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="360"
        y1="530"
        x2="470"
        y2="530"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="350"
        y1="560"
        x2="460"
        y2="560"
        stroke="#c75d3d"
        strokeWidth={5}
        strokeLinecap="round"
      />

      {/* 卷轴内的打勾符号（珊瑚色） */}
      <path
        d="M 420 325 L 430 335 L 450 310"
        fill="none"
        stroke="#d97757"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 450 565 L 460 580 L 485 545"
        fill="none"
        stroke="#d97757"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Logo = memo(LogoComponent);
