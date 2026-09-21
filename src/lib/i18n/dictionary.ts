import type { Locale } from "./config";
import { common } from "./dictionaries/common";
import { login } from "./dictionaries/login";
import { notFound } from "./dictionaries/notFound";
import { dashboard } from "./dictionaries/dashboard";
import { adminPage } from "./dictionaries/adminPage";
import { capturePage } from "./dictionaries/capturePage";
import { appShell } from "./dictionaries/appShell";
import { changePasswordBanner } from "./dictionaries/changePasswordBanner";
import { creditsInput } from "./dictionaries/creditsInput";
import { deletePostButton } from "./dictionaries/deletePostButton";
import { instagramPreview } from "./dictionaries/instagramPreview";
import { tooltip } from "./dictionaries/tooltip";
import { rootMetadata } from "./dictionaries/rootMetadata";
import { captureForm } from "./dictionaries/captureForm";
import { templateBuilder } from "./dictionaries/templateBuilder";
import { artEditor } from "./dictionaries/artEditor";
import { adminPanel } from "./dictionaries/adminPanel";
import { postWorkspace } from "./dictionaries/postWorkspace";
import { cardQuickActions } from "./dictionaries/cardQuickActions";
import { videoEditor } from "./dictionaries/videoEditor";
import { onboarding } from "./dictionaries/onboarding";
import { actionOverlay } from "./dictionaries/actionOverlay";

const dictionaries = {
  pt: {
    common: common.pt,
    login: login.pt,
    notFound: notFound.pt,
    dashboard: dashboard.pt,
    adminPage: adminPage.pt,
    capturePage: capturePage.pt,
    appShell: appShell.pt,
    changePasswordBanner: changePasswordBanner.pt,
    creditsInput: creditsInput.pt,
    deletePostButton: deletePostButton.pt,
    instagramPreview: instagramPreview.pt,
    tooltip: tooltip.pt,
    rootMetadata: rootMetadata.pt,
    captureForm: captureForm.pt,
    templateBuilder: templateBuilder.pt,
    artEditor: artEditor.pt,
    adminPanel: adminPanel.pt,
    postWorkspace: postWorkspace.pt,
    cardQuickActions: cardQuickActions.pt,
    videoEditor: videoEditor.pt,
    onboarding: onboarding.pt,
    actionOverlay: actionOverlay.pt,
  },
  en: {
    common: common.en,
    login: login.en,
    notFound: notFound.en,
    dashboard: dashboard.en,
    adminPage: adminPage.en,
    capturePage: capturePage.en,
    appShell: appShell.en,
    changePasswordBanner: changePasswordBanner.en,
    creditsInput: creditsInput.en,
    deletePostButton: deletePostButton.en,
    instagramPreview: instagramPreview.en,
    tooltip: tooltip.en,
    rootMetadata: rootMetadata.en,
    captureForm: captureForm.en,
    templateBuilder: templateBuilder.en,
    artEditor: artEditor.en,
    adminPanel: adminPanel.en,
    postWorkspace: postWorkspace.en,
    cardQuickActions: cardQuickActions.en,
    videoEditor: videoEditor.en,
    onboarding: onboarding.en,
    actionOverlay: actionOverlay.en,
  },
} satisfies Record<Locale, unknown>;

export type Dictionary = (typeof dictionaries)["pt"];

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
