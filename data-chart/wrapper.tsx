"use client"

import type React from "react"

import { cn } from "@/lib/utils"

interface ChartWrapperProps {
  content: React.ComponentType<Record<string, never>>
  className?: string
  title?: string
}

export function ChartWrapper({ content: Chart, className, title }: ChartWrapperProps) {
  return (
    <div className={cn("w-full h-full", className)}>
      <Chart />
      {title && <span className="sr-only">{title}</span>}
    </div>
  )
}
