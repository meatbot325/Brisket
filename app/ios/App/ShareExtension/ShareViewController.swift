import UIKit
import WebKit
import UniformTypeIdentifiers

/// "Share → Sniffd": pulls the link out of whatever was shared (an ad, a post, a web page)
/// and shows the Sniffd verdict right inside the share sheet.
class ShareViewController: UIViewController, WKNavigationDelegate {
    // Bruno's animations are muted videos: allow them to play inline and on their own.
    private let webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        return WKWebView(frame: .zero, configuration: config)
    }()
    private let site = "https://getsniffd.com/"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.082, green: 0.071, blue: 0.059, alpha: 1)

        let bar = UINavigationBar()
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.barStyle = .black
        bar.tintColor = UIColor(red: 0.91, green: 0.64, blue: 0.36, alpha: 1)
        let item = UINavigationItem(title: "Sniffd")
        item.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        bar.setItems([item], animated: false)

        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.navigationDelegate = self

        view.addSubview(bar)
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: bar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        findSharedText { [weak self] text in
            guard let self = self else { return }
            var parts = URLComponents(string: self.site)!
            var items = [URLQueryItem(name: "src", value: "ios-share")]
            if let text = text, !text.isEmpty { items.append(URLQueryItem(name: "text", value: text)) }
            parts.queryItems = items
            self.webView.load(URLRequest(url: parts.url!))
        }
    }

    /// Prefers a shared web link; falls back to shared text (captions often contain the link).
    private func findSharedText(_ completion: @escaping (String?) -> Void) {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let urlType = UTType.url.identifier, textType = UTType.plainText.identifier
        let finish: (String?) -> Void = { value in DispatchQueue.main.async { completion(value) } }

        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
            p.loadItem(forTypeIdentifier: urlType, options: nil) { item, _ in
                if let url = item as? URL { finish(url.absoluteString) }
                else if let s = item as? String { finish(s) }
                else { finish(nil) }
            }
        } else if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
            p.loadItem(forTypeIdentifier: textType, options: nil) { item, _ in finish(item as? String) }
        } else {
            finish(nil)
        }
    }

    /// Links that leave Sniffd (a store, an outside page) open in Safari instead of inside the sheet.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.navigationType == .linkActivated, let url = action.request.url, url.host != "getsniffd.com" {
            openOutside(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    private func openOutside(_ url: URL) {
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication { app.open(url); return }
            responder = r.next
        }
    }

    @objc private func done() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
