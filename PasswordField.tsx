import { useState, type InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return <span className="password-field">
    <input {...props} type={visible ? "text" : "password"} />
    <button
      className="password-visibility-toggle"
      type="button"
      onClick={() => setVisible(value => !value)}
      aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={visible}
    >
      {visible ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 5.2A10.8 10.8 0 0112 5c5.4 0 9 5 9 7a9.8 9.8 0 01-2.4 3.4M6.2 6.3C3.9 7.7 2 10.2 2 12c0 2 3.6 7 10 7 1.1 0 2.1-.2 3-.5" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
    </button>
  </span>;
}
