import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AuthShell from '../components/AuthShell'
import LoginForm from './Login'
import SignupFlow from './Signup'

// Pagina unica per login e registrazione: tiene la card montata mentre si
// passa da una modalità all'altra, così il pannello rosso può scivolare da
// destra (login) a sinistra (signup) svelando il form dell'altro lato.
// Le route /login e /signup impostano solo la modalità iniziale; i link
// interni cambiano modalità senza navigare (la card non si rimonta mai).
export default function Auth({ initialMode = 'login' }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState(initialMode)
  const isLogin = mode === 'login'

  return (
    <AuthShell
      heroSide={isLogin ? 'right' : 'left'}
      heroTitle={isLogin ? t('login.heroTitle') : t('signup.heroTitle')}
      heroText={isLogin ? t('login.heroText') : t('signup.heroText')}
    >
      <div className="auth-form-fade" key={mode}>
        {isLogin
          ? <LoginForm onSwitch={() => setMode('signup')} />
          : <SignupFlow onSwitch={() => setMode('login')} />}
      </div>
    </AuthShell>
  )
}
