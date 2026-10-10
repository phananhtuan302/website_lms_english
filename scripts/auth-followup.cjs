const fs=require('fs');
let p='client/src/pages/LoginPage.tsx',s=fs.readFileSync(p,'utf8');
s=s.replace("import { useState, type FormEvent }", "import { useEffect, useState, type FormEvent }");
s=s.replace("  const [email, setEmail] = useState('');", `  const [email, setEmail] = useState(() => { try { return localStorage.getItem('webeng.rememberedEmail') ?? ''; } catch { return ''; } });
  const [rememberEmail, setRememberEmail] = useState(() => { try { return localStorage.getItem('webeng.rememberedEmail') !== null; } catch { return false; } });
  useEffect(() => {
    try {
      if (rememberEmail) localStorage.setItem('webeng.rememberedEmail', email);
      else localStorage.removeItem('webeng.rememberedEmail');
    } catch { /* Storage may be disabled; authentication must remain available. */ }
  }, [rememberEmail, email]);`);
s=s.replace("  const [showPassword, setShowPassword] = useState(false);\n",'').replace("type={showPassword ? 'text' : 'password'}",'type="password"').replace('checked={showPassword}','checked={rememberEmail}').replace('setShowPassword(event.target.checked)','setRememberEmail(event.target.checked)').replace("t('auth.login.showPassword')","t('auth.login.rememberEmail')");
s=s.replace('{/* T-113: lets a young student check what they typed. */}','{/* Explicit opt-in remembers email only; browser password managers own passwords. */}');
fs.writeFileSync(p,s);
p='client/src/pages/RegisterPage.tsx';s=fs.readFileSync(p,'utf8');s=s.replace("          <span className=\"text-xs font-normal text-base-black/50\">\n            {t('auth.register.passwordHint', { count: MIN_PASSWORD_LENGTH })}\n          </span>",`          {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
            <span id="register-password-warning" role="status" className="text-xs font-normal text-red-700">
              {t('auth.register.passwordHint', { count: MIN_PASSWORD_LENGTH })}
            </span>
          )}`);s=s.replace('autoComplete="new-password"','autoComplete="new-password"\n            aria-invalid={password.length > 0 && password.length < MIN_PASSWORD_LENGTH}\n            aria-describedby={password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? "register-password-warning" : undefined}');fs.writeFileSync(p,s);
for (const page of ['Login','Register']) {p=`client/src/pages/${page}Page.tsx`;s=fs.readFileSync(p,'utf8').replaceAll('focus-visible:ring-2 focus-visible:ring-primary-700/25 focus-visible:ring-offset-2','focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700');s=s.replaceAll('focus-visible:outline-none focus-visible:outline','focus-visible:outline');fs.writeFileSync(p,s);}
for (const lang of ['en','vi']) {p=`client/src/i18n/${lang}.json`;s=fs.readFileSync(p,'utf8'); const data=JSON.parse(s);data.auth.login.rememberEmail=lang==='en'?'Remember email':'Nhớ email';fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');}
