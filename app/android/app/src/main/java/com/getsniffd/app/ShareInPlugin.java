package com.getsniffd.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hands text shared to Sniffd (Share menu) to the web page, which pulls the link out and checks it. */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private static JSObject pending;
    private static ShareInPlugin instance;

    @Override
    public void load() { instance = this; }

    static void receive(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        JSObject data = new JSObject();
        data.put("text", intent.getStringExtra(Intent.EXTRA_TEXT));
        data.put("title", intent.getStringExtra(Intent.EXTRA_SUBJECT));
        intent.setAction(Intent.ACTION_MAIN); // don't re-run the same share after rotation or restore
        if (instance != null && instance.hasListeners("shared")) {
            instance.notifyListeners("shared", data);
        } else {
            pending = data;
        }
    }

    @PluginMethod
    public void getShared(PluginCall call) {
        JSObject data = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(data);
    }
}
