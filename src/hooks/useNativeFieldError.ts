import { useState, type FormEvent } from 'react';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function useNativeFieldError() {
  const [nativeError, setNativeError] = useState('');

  const handleInvalid = (event: FormEvent<Control>) => {
    setNativeError(event.currentTarget.validationMessage);
  };

  const handleInput = (event: FormEvent<Control>) => {
    if (nativeError) setNativeError(event.currentTarget.validationMessage);
  };

  return { nativeError, handleInput, handleInvalid };
}
