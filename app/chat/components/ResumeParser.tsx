// app/chat/components/ResumeParser.tsx
// Drag-drop resume parser with auto-fill extraction

'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { extractUserDataFromResume } from '@/lib/user-data-extractor';

interface UserData {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

interface ResumeParserProps {
  onDataExtracted: (data: UserData) => void;
  onClose?: () => void;
}

export function ResumeParser({ onDataExtracted, onClose }: ResumeParserProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Read file as text
      const text = await file.text();
      
      // Extract user data using regex patterns
      const userData = extractUserDataFromResume(text);
      
      if (!userData.email && !userData.fullName) {
        throw new Error('Could not extract contact information from resume');
      }
      
      setExtractedData(userData);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse resume');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    if (extractedData) {
      onDataExtracted(extractedData);
      onClose?.();
    }
  };

  const handleEdit = (field: keyof UserData, value: string) => {
    if (extractedData) {
      setExtractedData({
        ...extractedData,
        [field]: value
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-100">
          Upload Resume
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>

      {!extractedData ? (
        <>
          {/* Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging 
                ? 'border-orange-500 bg-orange-500/10' 
                : 'border-slate-600 hover:border-slate-500'
              }
            `}
          >
            {isProcessing ? (
              <div className="py-8">
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-300">Parsing resume...</p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-300 mb-2">
                  Drag and drop your resume here
                </p>
                <p className="text-sm text-slate-400 mb-4">
                  or click to browse
                </p>
                <input
                  type="file"
                  accept=".txt,.pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="resume-upload"
                />
                <label
                  htmlFor="resume-upload"
                  className="inline-block px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg cursor-pointer transition-colors"
                >
                  Choose File
                </label>
                <p className="text-xs text-slate-500 mt-4">
                  Supported: .txt, .pdf, .doc, .docx
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Extracted Data */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm text-slate-300">
                Data extracted successfully! Review and edit if needed:
              </p>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={extractedData.fullName || ''}
                  onChange={(e) => handleEdit('fullName', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  placeholder="John Doe"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={extractedData.email || ''}
                  onChange={(e) => handleEdit('email', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  placeholder="john@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={extractedData.phone || ''}
                  onChange={(e) => handleEdit('phone', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  placeholder="(555) 123-4567"
                />
              </div>

              {/* LinkedIn */}
              {extractedData.linkedin && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    value={extractedData.linkedin}
                    onChange={(e) => handleEdit('linkedin', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}

              {/* GitHub */}
              {extractedData.github && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    GitHub
                  </label>
                  <input
                    type="url"
                    value={extractedData.github}
                    onChange={(e) => handleEdit('github', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2 font-medium transition-colors"
            >
              Use This Data
            </button>
            <button
              onClick={() => setExtractedData(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              Upload Different File
            </button>
          </div>
        </>
      )}
    </div>
  );
}
