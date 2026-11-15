fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("assets/app.ico");
        res.set("ProductName", "VEX IQ 3D CAD Viewer");
        res.set(
            "FileDescription",
            "VEX IQ 3D CAD Parts Viewer & STL Catalog",
        );
        res.set("OriginalFilename", "vex-iq-viewer.exe");
        res.set("InternalName", "vex-iq-viewer");
        res.set("CompanyName", "VEX RU Open-Source Community");
        res.set("LegalCopyright", "Apache-2.0 License");
        res.set_manifest(
            r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"#,
        );

        // Compile resources when rc.exe or windres is available without breaking minimal setups
        if let Err(err) = res.compile() {
            println!("cargo:warning=winresource skipped: {err}");
        }
    }
}
