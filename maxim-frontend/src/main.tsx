import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { UserProvider } from '@/contexts/UserContext'
import { UiPreferencesProvider } from '@/contexts/UiPreferencesContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { DocumentsProvider } from '@/contexts/DocumentsContext'
import { ScannedPdfsProvider } from '@/contexts/ScannedPdfsContext'
import { SignableTemplatesProvider } from '@/contexts/SignableTemplatesContext'
import { SignableSubmissionsProvider } from '@/contexts/SignableSubmissionsContext'
import { FormSubmissionsProvider } from '@/contexts/FormSubmissionsContext'
import { SigningProvider } from '@/contexts/SigningContext'
import { CertificatesProvider } from '@/contexts/CertificatesContext'
import { SubcontractorsProvider } from '@/contexts/SubcontractorsContext'
import { EmployeesProvider } from '@/contexts/EmployeesContext'
import { InjuryReportsProvider } from '@/contexts/InjuryReportsContext'
import { SafetyAlertsProvider } from '@/contexts/SafetyAlertsContext'
import { SafetyObservationsProvider } from '@/contexts/SafetyObservationsContext'
import { CorrectiveActionsProvider } from '@/contexts/CorrectiveActionsContext'
import { RootCauseProvider } from '@/contexts/RootCauseContext'
import { PinnedSafetyProvider } from '@/contexts/PinnedSafetyContext'
import { HRTodosProvider } from '@/contexts/HRTodosContext'
import { FrankProvider } from '@/contexts/FrankContext'
import { PresenceProvider } from '@/contexts/PresenceContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <UserProvider>
            <UiPreferencesProvider>
              <PresenceProvider>
                <DocumentsProvider>
                  <ScannedPdfsProvider>
                    <SigningProvider>
                      <SignableTemplatesProvider>
                        <SignableSubmissionsProvider>
                          <FormSubmissionsProvider>
                          <CertificatesProvider>
                            <SubcontractorsProvider>
                              <EmployeesProvider>
                                <InjuryReportsProvider>
                                <SafetyAlertsProvider>
                                  <SafetyObservationsProvider>
                                    <CorrectiveActionsProvider>
                                      <RootCauseProvider>
                                        <PinnedSafetyProvider>
                                          <HRTodosProvider>
                                            <FrankProvider>
                                              <App />
                                            </FrankProvider>
                                          </HRTodosProvider>
                                        </PinnedSafetyProvider>
                                      </RootCauseProvider>
                                    </CorrectiveActionsProvider>
                                  </SafetyObservationsProvider>
                                </SafetyAlertsProvider>
                              </InjuryReportsProvider>
                              </EmployeesProvider>
                            </SubcontractorsProvider>
                          </CertificatesProvider>
                        </FormSubmissionsProvider>
                          </SignableSubmissionsProvider>
                        </SignableTemplatesProvider>
                      </SigningProvider>
                  </ScannedPdfsProvider>
                </DocumentsProvider>
              </PresenceProvider>
            </UiPreferencesProvider>
          </UserProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
