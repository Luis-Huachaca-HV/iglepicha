import { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ConfirmActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  actionLabel: string;
  variant?: 'default' | 'destructive';
  requiresText?: string;
  isLoading?: boolean;
}

export function ConfirmActionDialog({
  isOpen = true,
  onClose,
  onConfirm,
  title,
  description,
  actionLabel,
  variant = 'default',
  requiresText,
  isLoading = false,
}: ConfirmActionDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isTextConfirmed = !requiresText || confirmText === requiresText;
  const canConfirm = isTextConfirmed && !isProcessing && !isLoading;

  const handleConfirm = async () => {
    if (!canConfirm) return;

    setIsProcessing(true);
    try {
      await onConfirm();
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setConfirmText('');
        onClose();
      }, 1200);
    } catch (error) {
      setIsProcessing(false);
      console.error('ConfirmActionDialog error:', error);
    }
  };

  const handleClose = () => {
    if (!isProcessing && !isLoading) {
      setConfirmText('');
      setShowSuccess(false);
      onClose();
    }
  };

  const accentColor = variant === 'destructive' ? '#E86161' : '#F4B942';
  const accentText = variant === 'destructive' ? '#172014' : '#172014';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            aria-hidden="true"
          />

          <motion.div
            key="dialog"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="w-full max-w-sm pointer-events-auto rounded-2xl sm:rounded-xl"
              style={{ backgroundColor: '#18352A' }}
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
            >
              <div className="p-6 sm:p-5">
                {/* Success State */}
                {showSuccess ? (
                  <motion.div
                    className="flex flex-col items-center gap-4"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                    >
                      <CheckCircle2
                        size={48}
                        style={{ color: '#43C47A' }}
                        strokeWidth={1.5}
                      />
                    </motion.div>
                    <p
                      className="text-center font-medium"
                      style={{ color: '#F3F7F3', fontSize: '16px' }}
                    >
                      Completado
                    </p>
                  </motion.div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="flex gap-3 mb-4 items-start">
                      <div
                        className="flex-shrink-0 mt-0.5"
                        style={{
                          color: accentColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AlertCircle size={24} strokeWidth={1.5} />
                      </div>
                      <h2
                        id="confirm-dialog-title"
                        className="text-lg font-semibold leading-tight"
                        style={{ color: '#F3F7F3' }}
                      >
                        {title}
                      </h2>
                    </div>

                    {/* Description */}
                    <p
                      className="mb-5 text-sm leading-relaxed"
                      style={{ color: '#B7C8BD' }}
                    >
                      {description}
                    </p>

                    {/* Text Confirmation Input */}
                    {requiresText && (
                      <div className="mb-5">
                        <label
                          htmlFor="confirm-text-input"
                          className="block text-xs font-medium mb-2 uppercase tracking-wide"
                          style={{ color: '#B7C8BD' }}
                        >
                          Escribe{' '}
                          <span style={{ color: accentColor }} className="font-semibold">
                            {requiresText}
                          </span>{' '}
                          para confirmar
                        </label>
                        <input
                          id="confirm-text-input"
                          type="text"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          placeholder={requiresText}
                          disabled={isProcessing || isLoading}
                          className="w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150"
                          style={{
                            backgroundColor: '#10231D',
                            color: '#F3F7F3',
                            borderWidth: '1px',
                            borderColor: isTextConfirmed ? '#2B4A3B' : accentColor,
                            opacity: isProcessing || isLoading ? 0.6 : 1,
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canConfirm) {
                              handleConfirm();
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleClose}
                        disabled={isProcessing || isLoading}
                        className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 active:scale-[0.97]"
                        style={{
                          backgroundColor: '#2B4A3B',
                          color: '#F3F7F3',
                          opacity: isProcessing || isLoading ? 0.5 : 1,
                          cursor:
                            isProcessing || isLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: accentColor,
                          color: accentText,
                          opacity: canConfirm ? 1 : 0.5,
                          cursor: canConfirm ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {(isProcessing || isLoading) && (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              borderWidth: '2px',
                              borderColor: accentText,
                              borderTopColor: 'transparent',
                            }}
                          />
                        )}
                        <span>{actionLabel}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
