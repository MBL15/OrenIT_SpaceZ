import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="space-page space-landing">
      <header className="space-landing-header">
        <Link to="/" className="space-brand space-brand--header">
          <span className="space-brand-mark" aria-hidden>
            ◆
          </span>
          <span className="space-brand-word">SpacEdu</span>
        </Link>
        <nav className="space-landing-nav" aria-label="Аккаунт">
          <Link className="space-link" to="/login">
            Войти
          </Link>
          <Link className="space-btn space-btn--primary" to="/register">
            Регистрация
          </Link>
        </nav>
      </header>

      <main className="space-landing-main">
        <div className="space-landing-hero">
          <h1 className="space-landing-title">Обучение без границ</h1>
          <p className="space-landing-lead">
            SpacEdu — платформа с курсами, треками и личным прогрессом.
            Создайте аккаунт или войдите, чтобы продолжить.
          </p>
          <div className="space-landing-cta">
            <Link className="space-btn space-btn--primary space-btn--lg" to="/register">
              Начать бесплатно
            </Link>
            <Link className="space-btn space-btn--outline space-btn--lg" to="/login">
              Уже есть аккаунт
            </Link>
          </div>
        </div>
      </main>

      <footer className="space-landing-footer">
        <span>© SpacEdu</span>
      </footer>
    </div>
  )
}
