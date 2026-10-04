'use client'

import React, { useState, useRef } from 'react'
import clsx from 'clsx'
import { Upload, CheckCircle2 } from 'lucide-react'

export interface FileUploaderProps {
  onChange: (file: File) => void
  accept?: string
  className?: string
}

export function FileUploader({ onChange, accept = '.csv', className }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile)
        onChange(droppedFile)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      onChange(selectedFile)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div
      className={clsx(
        'relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-colors duration-200 cursor-pointer bg-bg-surface',
        isDragging ? 'border-accent-gold shadow-[0_0_20px_rgba(242,185,0,0.1)]' : 'border-border hover:border-text-secondary',
        file && 'border-success bg-bg-card',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        className="hidden"
      />
      
      <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
        <Upload
          className={clsx(
            'absolute inset-0 w-full h-full text-text-secondary transition-all duration-300',
            file ? 'scale-25 opacity-0 blur-sm' : 'scale-100 opacity-100 blur-none'
          )}
        />
        <CheckCircle2
          className={clsx(
            'absolute inset-0 w-full h-full text-success transition-all duration-300',
            file ? 'scale-100 opacity-100 blur-none' : 'scale-25 opacity-0 blur-sm'
          )}
        />
      </div>
      
      <p className="text-lg font-medium text-text-primary mb-1">
        {file ? file.name : 'Click or drag CSV file to upload'}
      </p>
      <p className="text-sm text-text-muted">
        {file ? 'File ready to process' : 'Only .csv files are supported'}
      </p>
    </div>
  )
}
